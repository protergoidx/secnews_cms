import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import type { Prisma } from "../../generated/prisma/client.js";
import { SuggestionStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../../common/errors.js";
import { idParam } from "../../common/pagination.js";
import { mergeReferences } from "../../common/references.js";
import { formatRecommendations } from "../../common/recommendations.js";
import { recordActivity } from "./activity.js";
import {
  ListSuggestionsQuerySchema,
  ListSuggestionsResponseSchema,
  SuggestionActionResponseSchema,
} from "../ai/schema.js";
import {
  SUGGESTIBLE_FIELDS,
  toSuggestion,
  type SuggestibleField,
} from "../ai/service.js";
import { findInvalidCveIds } from "./validation.js";

const listParams = idParam;

const actionParams = z.object({
  id: z.uuid(),
  suggestionId: z.uuid(),
});

const deleteParams = z.object({
  id: z.uuid(),
});

function toList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function mergeFor(
  field: SuggestibleField,
  value: string,
): Prisma.TicketUpdateInput {
  switch (field) {
    case "overview":
      return { overview: value };

    case "description":
      return { description: value };

    case "recommendations":
      return {
        recommendations: formatRecommendations(value),
      };

    case "mitigation":
      return { mitigation: value };

    case "affectedVersions":
      return { affectedVersions: value };

    case "references":
      // References harus digabung dengan nilai ticket terbaru
      // di dalam transaksi Accept, bukan diganti langsung.
      throw new AppError(
        "VALIDATION",
        "References must be merged with the current ticket.",
      );

    case "cveIds":
      return { cveIds: toList(value) };
  }
}

function parseSuggestion(row: {
  content: string;
}): {
  field: SuggestibleField;
  suggestedValue: string;
} {
  const payload = JSON.parse(row.content) as {
    field?: unknown;
    suggestedValue?: unknown;
  };

  const field = SUGGESTIBLE_FIELDS.find(
    (candidate) => candidate === payload.field,
  );

  if (
    field === undefined ||
    typeof payload.suggestedValue !== "string"
  ) {
    throw new AppError(
      "VALIDATION",
      "Suggestion payload does not reference a mergeable final field",
    );
  }

  return {
    field,
    suggestedValue: payload.suggestedValue,
  };
}

function decisionDetail(
  field: string,
  value: string,
  decision: "ACCEPTED" | "REJECTED" | "deleted",
): string {
  return JSON.stringify({
    field,
    value: value.slice(0, 500),
    decision,
  });
}

export default async function suggestionRoutes(
  app: FastifyInstance,
): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const work = app.requireRole(
    "ADMIN",
    "EDITOR",
    "ANALYST",
  );

  // List suggestions.
  f.get(
    "/:id/suggestions",
    {
      onRequest: [work],
      schema: {
        params: listParams,
        querystring: ListSuggestionsQuerySchema,
        response: {
          200: ListSuggestionsResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const {
        status,
        origin,
        page,
        pageSize,
      } = request.query;

      const where = {
        ticketId: id,
        ...(status === undefined
          ? {}
          : { status }),
        ...(origin === undefined
          ? {}
          : { origin: { in: origin } }),
      };

      const [rows, total] = await Promise.all([
        app.prisma.aiSuggestion.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        app.prisma.aiSuggestion.count({
          where,
        }),
      ]);

      return {
        items: rows.map(toSuggestion),
        total,
        page,
        pageSize,
      };
    },
  );

  // Accept suggestion and update final fields.
  f.post(
    "/:id/suggestions/:suggestionId/accept",
    {
      onRequest: [work],
      schema: {
        params: actionParams,
        response: {
          200: SuggestionActionResponseSchema,
        },
      },
    },
    async (request) => {
      const { id, suggestionId } = request.params;

      const row = await app.prisma.aiSuggestion.findFirst({
        where: {
          id: suggestionId,
          ticketId: id,
        },
      });

      if (row === null) {
        throw new AppError(
          "NOT_FOUND",
          "Suggestion not found for this ticket",
        );
      }

      if (row.status !== SuggestionStatus.PENDING) {
        throw new AppError(
          "CONFLICT",
          `Suggestion already ${row.status.toLowerCase()}`,
        );
      }

      const { field, suggestedValue } =
        parseSuggestion(row);

      if (field === "cveIds") {
        const invalid = findInvalidCveIds(
          toList(suggestedValue),
        );

        if (invalid.length > 0) {
          throw new AppError(
            "VALIDATION",
            `Suggestion not accepted: cveIds contains invalid CVE id(s) ${invalid.join(", ")} ` +
              "(expected CVE-YYYY-NNNNN) — edit the ticket fields manually or reject the suggestion",
            {
              field,
              invalid,
            },
            422,
          );
        }
      }

      const actorId = request.user.sub;

      const updated = await app.prisma.$transaction(
        async (tx) => {
          let data: Prisma.TicketUpdateInput;

          if (field === "references") {
            const currentTicket =
              await tx.ticket.findUnique({
                where: { id },
                select: {
                  references: true,
                },
              });

            if (currentTicket === null) {
              throw new AppError(
                "NOT_FOUND",
                "Ticket not found.",
              );
            }

            data = {
              references: mergeReferences(
                currentTicket.references,
                suggestedValue,
              ),
            };
          } else {
            data = mergeFor(field, suggestedValue);
          }

          await tx.ticket.update({
            where: { id },
            data,
          });

          // Conditional update prevents accepting a suggestion
          // that another request has already resolved.
          const claimed =
            await tx.aiSuggestion.updateMany({
              where: {
                id: suggestionId,
                ticketId: id,
                status: SuggestionStatus.PENDING,
              },
              data: {
                status: SuggestionStatus.ACCEPTED,
              },
            });

          if (claimed.count !== 1) {
            // Throwing rolls back the ticket update as well.
            throw new AppError(
              "CONFLICT",
              "Suggestion has already been resolved.",
            );
          }

          const accepted =
            await tx.aiSuggestion.findUnique({
              where: {
                id: suggestionId,
              },
            });

          if (accepted === null) {
            throw new AppError(
              "NOT_FOUND",
              "Suggestion not found.",
            );
          }

          await recordActivity(tx, {
            ticketId: id,
            actorId,
            action: "SUGGESTION_ACCEPTED",
            detail: decisionDetail(
              field,
              suggestedValue,
              "ACCEPTED",
            ),
          });

          return accepted;
        },
      );

      return {
        suggestion: toSuggestion(updated),
      };
    },
  );

  // Reject suggestion without changing final fields.
  f.post(
    "/:id/suggestions/:suggestionId/reject",
    {
      onRequest: [work],
      schema: {
        params: actionParams,
        response: {
          200: SuggestionActionResponseSchema,
        },
      },
    },
    async (request) => {
      const { id, suggestionId } = request.params;

      const row = await app.prisma.aiSuggestion.findFirst({
        where: {
          id: suggestionId,
          ticketId: id,
        },
      });

      if (row === null) {
        throw new AppError(
          "NOT_FOUND",
          "Suggestion not found for this ticket",
        );
      }

      if (row.status !== SuggestionStatus.PENDING) {
        throw new AppError(
          "CONFLICT",
          `Suggestion already ${row.status.toLowerCase()}`,
        );
      }

      const payload = JSON.parse(row.content) as {
        field?: unknown;
        suggestedValue?: unknown;
      };

      const field =
        typeof payload.field === "string"
          ? payload.field
          : "";

      const suggestedValue =
        typeof payload.suggestedValue === "string"
          ? payload.suggestedValue
          : "";

      const actorId = request.user.sub;

      const updated = await app.prisma.$transaction(
        async (tx) => {
          const claimed =
            await tx.aiSuggestion.updateMany({
              where: {
                id: suggestionId,
                ticketId: id,
                status: SuggestionStatus.PENDING,
              },
              data: {
                status: SuggestionStatus.REJECTED,
              },
            });

          if (claimed.count !== 1) {
            throw new AppError(
              "CONFLICT",
              "Suggestion has already been resolved.",
            );
          }

          const rejected =
            await tx.aiSuggestion.findUnique({
              where: {
                id: suggestionId,
              },
            });

          if (rejected === null) {
            throw new AppError(
              "NOT_FOUND",
              "Suggestion not found.",
            );
          }

          await recordActivity(tx, {
            ticketId: id,
            actorId,
            action: "SUGGESTION_REJECTED",
            detail: decisionDetail(
              field,
              suggestedValue,
              "REJECTED",
            ),
          });

          return rejected;
        },
      );

      return {
        suggestion: toSuggestion(updated),
      };
    },
  );

  // Delete a suggestion record.
  // Accepted values remain on the ticket.
  f.delete(
    "/suggestions/:id",
    {
      onRequest: [work],
      schema: {
        params: deleteParams,
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const row =
        await app.prisma.aiSuggestion.findUnique({
          where: { id },
        });

      if (row === null) {
        throw new AppError(
          "NOT_FOUND",
          "Suggestion not found",
        );
      }

      const payload = JSON.parse(row.content) as {
        field?: unknown;
        suggestedValue?: unknown;
      };

      const field =
        typeof payload.field === "string"
          ? payload.field
          : "";

      const suggestedValue =
        typeof payload.suggestedValue === "string"
          ? payload.suggestedValue
          : "";

      await app.prisma.$transaction(async (tx) => {
        await tx.aiSuggestion.delete({
          where: { id },
        });

        await recordActivity(tx, {
          ticketId: row.ticketId,
          actorId: request.user.sub,
          action: "SUGGESTION_DELETED",
          detail: decisionDetail(
            field,
            suggestedValue,
            "deleted",
          ),
        });
      });

      return reply.code(204).send();
    },
  );
}