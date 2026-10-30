import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])$/),
});

export type RecapCandidate = {
  id: string;
  title: string;
  status: string;
  overview: string | null;
  summary: string;
  description: string | null;
  recommendations: string | null;
  references: string[];
  cveIds: string[];
  createdAt: Date;
  sources: {
    url: string | null;
  }[];
  deliveries: {
    channel: {
      clientId: string;
    };
  }[];
  _count: {
    iocs: number;
  };
};

export function scoreRecap(
  candidate: RecapCandidate,
): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  function add(
    points: number,
    reason: string,
  ): void {
    if (points > 0) {
      score += points;
      reasons.push(`${reason} (+${points})`);
    }
  }

  const workflowPoints =
    candidate.status === "SENT"
      ? 30
      : candidate.status === "READY"
        ? 20
        : 10;

  add(
    workflowPoints,
    `Workflow: ${candidate.status}`,
  );

  const deliveredClients = new Set(
    candidate.deliveries.map(
      (item) => item.channel.clientId,
    ),
  );

  add(
    Math.min(deliveredClients.size, 5) * 4,
    "Successful delivery reach",
  );

  add(
    candidate.overview?.trim() ? 10 : 0,
    "Overview available",
  );

  add(
    candidate.description?.trim() ? 10 : 0,
    "Description available",
  );

  add(
    candidate.recommendations?.trim() ? 10 : 0,
    "Recommendations available",
  );

  const cves = new Set(
    candidate.cveIds
      .map((id) => id.toUpperCase())
      .filter((id) =>
        /^CVE-\d{4}-\d{4,}$/.test(id),
      ),
  );

  add(
    Math.min(cves.size, 3) * 3,
    "Recorded CVE identifiers",
  );

  const urls = new Set<string>();

  const supportingUrls = [
    ...candidate.references,
    ...candidate.sources.map(
      (source) => source.url,
    ),
  ];

  for (const input of supportingUrls) {
    if (!input) {
      continue;
    }

    try {
      const url = new URL(input);

      if (
        !["http:", "https:"].includes(
          url.protocol,
        ) ||
        url.username !== "" ||
        url.password !== ""
      ) {
        continue;
      }

      url.hash = "";
      urls.add(url.href);
    } catch {
      // Invalid URLs do not contribute to the score.
    }
  }

  add(
    Math.min(urls.size, 3) * 3,
    "Supporting URLs",
  );

  add(
    candidate._count.iocs > 0 ? 2 : 0,
    "Recorded indicators",
  );

  return {
    score,
    reasons,
  };
}

type RankedStory = {
  id: string;
  title: string;
  status: string;
  overview: string;
  references: string[];
  createdAt: string;
  score: number;
  reasons: string[];
};

export default async function topRecapRoutes(
  app: FastifyInstance,
): Promise<void> {
  const f =
    app.withTypeProvider<ZodTypeProvider>();

  f.get(
    "/recap-top",
    {
      onRequest: [
        app.requireRole(
          "ADMIN",
          "EDITOR",
          "ANALYST",
        ),
      ],
      schema: {
        querystring: querySchema,
      },
    },
    async (request) => {
      const { month } =
        querySchema.parse(request.query);

      const [year, monthNumber] = month
        .split("-")
        .map(Number);

      const from = new Date(
        `${month}-01T00:00:00.000Z`,
      );

      // JS months are zero-based. Passing the selected
      // month number gives the first day of next month.
      const to = new Date(
        Date.UTC(
          year ?? 2000,
          monthNumber ?? 1,
          1,
        ),
      );

      const ranked: RankedStory[] = [];

      let cursor: string | undefined;
      let examined = 0;
      let eligible = 0;

      for (;;) {
        const batch: RecapCandidate[] =
          await app.prisma.ticket.findMany({
            where: {
              createdAt: {
                gte: from,
                lt: to,
              },
              status: {
                in: [
                  "READY",
                  "SENT",
                  "CLOSED",
                ],
              },
            },
            select: {
              id: true,
              title: true,
              status: true,
              overview: true,
              summary: true,
              description: true,
              recommendations: true,
              references: true,
              cveIds: true,
              createdAt: true,
              sources: {
                select: {
                  url: true,
                },
              },
              deliveries: {
                where: {
                  status: "SENT",
                },
                select: {
                  channel: {
                    select: {
                      clientId: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  iocs: true,
                },
              },
            },
            orderBy: {
              id: "asc",
            },
            take: 100,
            ...(cursor
              ? {
                  cursor: {
                    id: cursor,
                  },
                  skip: 1,
                }
              : {}),
          });

        examined += batch.length;

        for (const ticket of batch) {
          const overview =
            ticket.overview?.trim() ||
            ticket.summary.trim();

          if (
            overview === "" ||
            ticket.title.trim() === ""
          ) {
            continue;
          }

          eligible++;

          ranked.push({
            id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            overview,
            references: [
              ...new Set(ticket.references),
            ],
            createdAt:
              ticket.createdAt.toISOString(),
            ...scoreRecap(ticket),
          });
        }

        ranked.sort(
          (left, right) =>
            right.score - left.score ||
            right.createdAt.localeCompare(
              left.createdAt,
            ) ||
            left.id.localeCompare(right.id),
        );

        // Keep only the highest five while continuing
        // to examine all tickets in the selected month.
        ranked.splice(5);

        const last = batch.at(-1);

        if (
          batch.length < 100 ||
          last === undefined
        ) {
          break;
        }

        cursor = last.id;
      }

      return {
        month,
        items: ranked,
        examined,
        eligible,
        method: "EDITORIAL_READINESS_V1",
        criteria: [
          "Eligible: READY, SENT, or CLOSED; non-empty title and overview/summary.",
          "Workflow: SENT 30, READY 20, CLOSED 10 points.",
          "Successful delivery: 4 points per distinct client, maximum 20.",
          "Overview, Description, Recommendations: 10 points each.",
          "Valid CVE format: 3 points each, maximum 9.",
          "Distinct HTTP/HTTPS supporting URLs: 3 points each, maximum 9.",
          "At least one recorded IOC: 2 points.",
          "Ties: newest ticket creation date, then ID.",
        ],
        note:
          "Editorial readiness score, not threat severity, popularity, or independently verified impact. " +
          "Period uses ticket creation dates in UTC. Review before sharing.",
      };
    },
  );
}