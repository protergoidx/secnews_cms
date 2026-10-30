import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";

const paramsSchema = z.object({
  id: z.uuid(),
});

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

const LIMIT = 2000;

const STOP_WORDS = new Set(
  [
    "about", "after", "against", "also", "amid",
    "and", "are", "been", "before", "being",
    "could", "demo", "dengan", "dari", "discovered",
    "for", "from", "have", "into", "lebih",
    "news", "new", "oleh", "pada", "para",
    "report", "reports", "security", "sebuah",
    "secnews", "that", "their", "this", "through",
    "untuk", "update", "updates", "using",
    "vulnerability", "vulnerabilities", "were",
    "which", "with", "yang", "critical", "high",
    "attack", "attacks", "latest", "says", "said",
  ],
);

export function relatedCves(text: string): string[] {
  return [
    ...new Set(
      (text.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? [])
        .map((id) => id.toUpperCase()),
    ),
  ];
}

function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? []
  );
}

function terms(text: string): string[] {
  return [
    ...new Set(
      tokens(
        text.replace(/\bCVE-\d{4}-\d{4,}\b/gi, " "),
      ).filter(
        (term) =>
          term.length >= 3 &&
          !/^\d+$/.test(term) &&
          !STOP_WORDS.has(term),
      ),
    ),
  ].slice(0, 12);
}

function plainText(input: string): string {
  return input
    .slice(0, 50000)
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
      " ",
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(nbsp|amp|lt|gt|quot|apos);/gi,
      (match, name: string) => {
        const entities: Record<string, string> = {
          nbsp: " ",
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        };

        return entities[name.toLowerCase()] ?? match;
      },
    )
    .replace(
      /&#(x[0-9a-f]+|[0-9]+);/gi,
      (match, digits: string) => {
        const number = digits
          .toLowerCase()
          .startsWith("x")
          ? Number.parseInt(digits.slice(1), 16)
          : Number.parseInt(digits, 10);

        return number > 0 &&
          number <= 0x10ffff &&
          !(number >= 0xd800 && number <= 0xdfff)
          ? String.fromCodePoint(number)
          : match;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function feedText(raw: unknown): string {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw)
  ) {
    return "";
  }

  const record = raw as Record<string, unknown>;
  const parts: string[] = [];

  const contentKeys = [
    "summary",
    "description",
    "contentSnippet",
    "content",
    "content:encoded",
  ];

  for (const key of contentKeys) {
    const value = record[key];

    if (typeof value === "string") {
      parts.push(plainText(value));
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const nested = value as Record<string, unknown>;
      const text = nested["value"] ?? nested["_"];

      if (typeof text === "string") {
        parts.push(plainText(text));
      }
    }
  }

  return [...new Set(parts.filter(Boolean))]
    .join("\n")
    .slice(0, 20000);
}

function validUrl(
  value: string | null,
): value is string {
  if (!value || /\s/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function urlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

export function scoreRelated(
  title: string,
  text: string,
  cves: readonly string[],
  keywords: readonly string[],
): {
  score: number;
  reasons: string[];
} {
  const candidateCves = new Set(
    relatedCves(`${title}\n${text}`),
  );

  const titleTokens = new Set(tokens(title));
  const textTokens = new Set(tokens(text));

  const shared = cves.filter((id) =>
    candidateCves.has(id),
  );

  const titleMatches = keywords.filter((term) =>
    titleTokens.has(term),
  );

  const contentMatches = keywords.filter(
    (term) =>
      !titleTokens.has(term) &&
      textTokens.has(term),
  );

  const reasons: string[] = [];

  if (shared.length > 0) {
    reasons.push(
      `Shared CVE: ${shared.join(", ")}`,
    );
  }

  if (titleMatches.length > 0) {
    reasons.push(
      `Title keywords: ${titleMatches.join(", ")}`,
    );
  }

  if (contentMatches.length > 0) {
    reasons.push(
      `Stored content keywords: ${contentMatches.join(", ")}`,
    );
  }

  return {
    score:
      shared.length * 100 +
      titleMatches.length * 5 +
      contentMatches.length * 2,
    reasons,
  };
}

function excerpt(
  text: string,
  keywords: readonly string[],
): string {
  const lower = text.toLowerCase();

  const positions = keywords
    .map((term) =>
      lower.indexOf(term.toLowerCase()),
    )
    .filter((index) => index >= 0);

  const start =
    positions.length > 0
      ? Math.max(0, Math.min(...positions) - 100)
      : 0;

  return [
    start > 0 ? "…" : "",
    text.slice(start, start + 800),
    text.length > start + 800 ? "…" : "",
  ].join("");
}

type RelatedItem = {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  score: number;
  reasons: string[];
};

export default async function relatedNewsRoutes(
  app: FastifyInstance,
): Promise<void> {
  const f =
    app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/:id/related-news",
    {
      onRequest: [
        app.requireRole(
          "ADMIN",
          "EDITOR",
          "ANALYST",
        ),
      ],
      schema: {
        params: paramsSchema,
        querystring: querySchema,
      },
    },
    async (request) => {
      const { id } =
        paramsSchema.parse(request.params);

      const { q } =
        querySchema.parse(request.query);

      const ticket =
        await app.prisma.ticket.findUnique({
          where: { id },
          select: {
            title: true,
            overview: true,
            summary: true,
            cveIds: true,
            affectedProduct: true,
            threatName: true,
            feedItemId: true,
            references: true,
            sources: {
              select: {
                url: true,
              },
            },
          },
        });

      if (!ticket) {
        throw new AppError(
          "NOT_FOUND",
          "Ticket not found.",
        );
      }

      const manual = q?.trim() ?? "";

      const cves = relatedCves(
        manual ||
          [
            ...ticket.cveIds,
            ticket.title,
            ticket.overview ?? "",
            ticket.summary,
          ].join("\n"),
      ).slice(0, 10);

      const searchTerms = terms(
        manual ||
          [
            ticket.affectedProduct,
            ticket.threatName,
            ticket.title,
          ]
            .filter(Boolean)
            .join(" "),
      );

      const keywords = [
        ...new Set([...cves, ...searchTerms]),
      ];

      if (keywords.length === 0) {
        return {
          items: [],
          keywords,
          scanned: 0,
          candidateLimit: LIMIT,
          limited: false,
          method: "STORED_CONTENT_CVE_AND_KEYWORDS",
        };
      }

      const existing = new Set(
        [
          ...ticket.references,
          ...ticket.sources.flatMap((source) =>
            source.url ? [source.url] : [],
          ),
        ].map(urlKey),
      );

      const candidates =
        new Map<string, RelatedItem>();

      let cursor: string | undefined;
      let scanned = 0;
      let limited = false;

      while (scanned < LIMIT) {
        const remaining = LIMIT - scanned;
        const batchSize = Math.min(
          100,
          remaining + 1,
        );

        const batch =
          await app.prisma.feedItem.findMany({
            where: {
              url: {
                not: null,
              },
              ...(ticket.feedItemId
                ? {
                    id: {
                      not: ticket.feedItemId,
                    },
                  }
                : {}),
            },
            select: {
              id: true,
              title: true,
              url: true,
              raw: true,
              publishedAt: true,
            },
            orderBy: [
              { createdAt: "desc" },
              { id: "desc" },
            ],
            take: batchSize,
            ...(cursor
              ? {
                  cursor: { id: cursor },
                  skip: 1,
                }
              : {}),
          });

        for (const candidate of batch) {
          if (scanned >= LIMIT) {
            limited = true;
            break;
          }

          scanned++;

          if (
            !validUrl(candidate.url) ||
            existing.has(urlKey(candidate.url))
          ) {
            continue;
          }

          const text = feedText(candidate.raw);

          const score = scoreRelated(
            candidate.title,
            text,
            cves,
            searchTerms,
          );

          if (score.score === 0) {
            continue;
          }

          const item: RelatedItem = {
            id: candidate.id,
            title: candidate.title,
            url: candidate.url,
            summary: excerpt(text, keywords),
            publishedAt:
              candidate.publishedAt?.toISOString() ??
              null,
            ...score,
          };

          const key = urlKey(candidate.url);
          const previous = candidates.get(key);

          if (
            !previous ||
            item.score > previous.score
          ) {
            candidates.set(key, item);
          }
        }

        const last = batch.at(-1);

        if (
          !last ||
          batch.length < batchSize ||
          limited
        ) {
          break;
        }

        cursor = last.id;

        if (scanned === LIMIT) {
          const more =
            await app.prisma.feedItem.findMany({
              where: {
                url: {
                  not: null,
                },
                ...(ticket.feedItemId
                  ? {
                      id: {
                        not: ticket.feedItemId,
                      },
                    }
                  : {}),
              },
              orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
              ],
              cursor: {
                id: cursor,
              },
              skip: 1,
              take: 1,
              select: {
                id: true,
              },
            });

          limited = more.length > 0;
        }
      }

      const items = [...candidates.values()]
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.id.localeCompare(right.id),
        )
        .slice(0, 20);

      return {
        items,
        keywords,
        scanned,
        candidateLimit: LIMIT,
        limited,
        method: "STORED_CONTENT_CVE_AND_KEYWORDS",
      };
    },
  );
}