import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import { IocType } from "../../generated/prisma/enums.js";
import { recordActivity } from "./activity.js";
import {
  extractDocumentIocs,
  type ExtractedIoc,
} from "./ioc-extract.js";
import { UuidIdParamSchema } from "./schema.js";
import {
  iocValueProblem,
  normalizeIocValue,
} from "./validation.js";

interface PreviewRow {
  type: IocType;
  value: string;
  context: string;
  filename: string;
  occurrences: number;
}

interface ExistingIoc {
  type: IocType;
  value: string;
}

const rowSchema = z.object({
  type: z.enum(IocType),
  value: z.string().trim().min(1).max(512),
  context: z.string().max(5000).default(""),
});

type ImportRow = z.infer<typeof rowSchema>;

const importBodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(1000),
});

const previewBodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ticket"),
  }),
  z.object({
    mode: z.literal("text"),
    text: z.string().trim().min(1).max(200000),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .default("Pasted message"),
  }),
]);

function heading(line: string): string {
  return line
    .trim()
    .replace(/^[#*\s]+|[*:\s]+$/g, "")
    .toLowerCase();
}

function iocKey(type: IocType, input: string): string {
  const value = normalizeIocValue(type, input);

  const caseInsensitiveTypes: readonly string[] = [
    "DOMAIN",
    "EMAIL",
    "MD5",
    "SHA1",
    "SHA256",
    "IPV6",
  ];

  const normalized = caseInsensitiveTypes.includes(type)
    ? value.toLowerCase()
    : value;

  return `${type}:${normalized}`;
}

export function previewMessageIocs(
  text: string,
  filename: string,
): PreviewRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let ignore = false;

  const sections = new Set([
    "overview",
    "description",
    "recommendations",
    "indicators of compromise",
    "iocs",
    "incident details",
    "vulnerability details",
    "affected products and environments",
  ]);

  const cleaned = lines.map((line: string): string => {
    const title = heading(line);

    if (
      [
        "references",
        "reference",
        "sources",
        "source links",
      ].includes(title)
    ) {
      ignore = true;
      return "";
    }

    if (sections.has(title)) {
      ignore = false;
    }

    if (
      /^(thank you\.?|best regards[,.:]?|regards[,.:]?)$/i.test(
        line.trim(),
      )
    ) {
      ignore = true;
    }

    return ignore ? "" : line;
  });

  const results = extractDocumentIocs([
    {
      sourceId: filename,
      filename,
      text: cleaned.join("\n"),
    },
  ]);

  return results.map((item: ExtractedIoc): PreviewRow => {
    let context = item.evidence[0]?.context ?? "";

    for (const evidence of item.evidence) {
      // Evidence lines are one-based. This starts at the next line.
      let index = evidence.line;

      while (
        index < cleaned.length &&
        !cleaned[index]?.trim()
      ) {
        index++;
      }

      const match = cleaned[index]?.match(
        /^\s*(?:[-*]\s*)?context\s*:\s*(.*)$/i,
      );

      if (match) {
        const block: string[] = [match[1] ?? ""];

        for (
          let next = index + 1;
          next < cleaned.length;
          next++
        ) {
          const line = cleaned[next]?.trim() ?? "";

          if (
            line === "" ||
            /^(?:domain|ipv4|ipv6|url|email|md5|sha1|sha256|hash|cidr|context)\s*:?$/i.test(
              line,
            ) ||
            sections.has(heading(line))
          ) {
            break;
          }

          block.push(line);
        }

        context = block.join("\n").trim();
        break;
      }
    }

    return {
      type: item.type,
      value: item.value,
      context: context.slice(0, 5000),
      filename,
      occurrences: item.evidence.length,
    };
  });
}

export default async function iocTextRoutes(
  app: FastifyInstance,
): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();

  const work = app.requireRole(
    "ADMIN",
    "EDITOR",
    "ANALYST",
  );

  f.post(
    "/:id/iocs/text-preview",
    {
      bodyLimit: 1_200_000,
      onRequest: [work],
      schema: {
        params: UuidIdParamSchema,
        body: previewBodySchema,
      },
    },
    async (req) => {
      const params = UuidIdParamSchema.parse(req.params);
      const body = previewBodySchema.parse(req.body);

      const ticket = await app.prisma.ticket.findUnique({
        where: {
          id: params.id,
        },
        select: {
          overview: true,
          description: true,
          summary: true,
        },
      });

      if (!ticket) {
        throw new AppError(
          "NOT_FOUND",
          "Ticket not found.",
        );
      }

      const filename =
        body.mode === "ticket"
          ? "Saved ticket content"
          : body.filename;

      const text =
        body.mode === "ticket"
          ? [
              ticket.overview || ticket.summary,
              ticket.description,
            ]
              .filter(Boolean)
              .join("\n\nDescription\n")
          : body.text;

      if (text.trim() === "") {
        throw new AppError(
          "VALIDATION",
          "Save Overview or Description first, or upload/paste a message.",
          undefined,
          400,
        );
      }

      let candidates: PreviewRow[];

      try {
        candidates = previewMessageIocs(
          text,
          filename,
        );
      } catch (error) {
        throw new AppError(
          "VALIDATION",
          error instanceof Error
            ? error.message
            : "Cannot extract text.",
          undefined,
          400,
        );
      }

      if (candidates.length > 1000) {
        throw new AppError(
          "VALIDATION",
          "More than 1,000 unique IOCs. Split the text into smaller batches.",
          undefined,
          400,
        );
      }

      const existing: ExistingIoc[] =
        await app.prisma.ioc.findMany({
          where: {
            ticketId: params.id,
          },
          select: {
            type: true,
            value: true,
          },
        });

      const keys = new Set<string>(
        existing.map((ioc: ExistingIoc): string =>
          iocKey(ioc.type, ioc.value),
        ),
      );

      return {
        rows: candidates.map((row: PreviewRow) => ({
          ...row,
          exists: keys.has(
            iocKey(row.type, row.value),
          ),
        })),
      };
    },
  );

  f.post(
    "/:id/iocs/text-import",
    {
      bodyLimit: 6_000_000,
      onRequest: [work],
      schema: {
        params: UuidIdParamSchema,
        body: importBodySchema,
      },
    },
    async (req) => {
      const params = UuidIdParamSchema.parse(req.params);
      const body = importBodySchema.parse(req.body);

      const ticket = await app.prisma.ticket.findUnique({
        where: {
          id: params.id,
        },
        select: {
          id: true,
        },
      });

      if (!ticket) {
        throw new AppError(
          "NOT_FOUND",
          "Ticket not found.",
        );
      }

      const rows: ImportRow[] = body.rows.map(
        (row: ImportRow): ImportRow => {
          const value = normalizeIocValue(
            row.type,
            row.value,
          );

          const problem = iocValueProblem(
            row.type,
            value,
          );

          if (problem) {
            throw new AppError(
              "VALIDATION",
              problem,
              undefined,
              400,
            );
          }

          return {
            ...row,
            value,
          };
        },
      );

      const added = await app.prisma.$transaction(
        async (tx) => {
          const result = await tx.ioc.createMany({
            data: rows.map((row: ImportRow) => ({
              type: row.type,
              value: row.value,
              context: row.context || null,
              ticketId: params.id,
              origin: "TEXT_EXTRACT",
              createdById: req.user.sub,
              includeInBulletin: true,
            })),
            skipDuplicates: true,
          });

          if (result.count > 0) {
            await recordActivity(tx, {
              ticketId: params.id,
              actorId: req.user.sub,
              action: "IOC_ADDED",
              detail:
                `Text extraction: ${result.count} IOC(s) added; ` +
                `${rows.length - result.count} duplicate(s) skipped.`,
            });
          }

          return result.count;
        },
      );

      return {
        added,
        skipped: rows.length - added,
      };
    },
  );
}