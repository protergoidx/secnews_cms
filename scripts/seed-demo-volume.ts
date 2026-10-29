import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connection = new URL(
  process.env["DATABASE_URL"] ?? "postgresql://invalid",
);

if (
  process.env["APP_ENV"] !== "development" ||
  !["db", "localhost", "127.0.0.1"].includes(
    connection.hostname,
  ) ||
  connection.pathname !== "/secnews_dev"
) {
  throw new Error(
    "Use APP_ENV=development and the local secnews_dev database.",
  );
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: connection.toString(),
  }),
});

function id(key: string): string {
  const hash = createHash("sha256")
    .update(`secnews-volume-v2:${key}`)
    .digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

const topics = [
  "Phishing investigation",
  "Gateway security review",
  "Credential access assessment",
  "Ransomware readiness exercise",
  "Cloud storage review",
  "Suspicious domain analysis",
  "Endpoint monitoring review",
  "Third-party access assessment",
  "Network segmentation review",
  "Authentication anomaly review",
];

const now = new Date();

function demoDate(index: number): Date {
  const bytes = createHash("sha256")
    .update(`date-${index}`)
    .digest();

  const days =
    bytes.readUInt8(0) < 110
      ? bytes.readUInt8(1) % 14
      : 14 + (bytes.readUInt8(1) % 76);

  return new Date(
    now.getTime() -
      (days * 1440 + (bytes.readUInt8(2) % 240)) * 60000,
  );
}

async function main(): Promise<void> {
  const actor = await db.user.findFirst({
    where: {
      role: {
        in: ["ADMIN", "EDITOR", "ANALYST"],
      },
    },
    select: { id: true },
  });

  if (actor === null) {
    throw new Error(
      "Create a local account or run seed-demo.ts first.",
    );
  }

  for (let n = 0; n < 5; n++) {
    await db.feedSource.upsert({
      where: { id: id(`feed-${n}`) },
      update: {},
      create: {
        id: id(`feed-${n}`),
        name: `[DEMO VOLUME] Source ${n + 1}`,
        url: `https://volume-source-${n}.example.com/rss`,
        isActive: false,
      },
    });

    await db.client.upsert({
      where: { id: id(`client-${n}`) },
      update: {},
      create: {
        id: id(`client-${n}`),
        name: `[DEMO VOLUME] Client ${n + 1}`,
        contactEmail: `volume-${n}@example.com`,
      },
    });

    await db.channel.upsert({
      where: { id: id(`channel-${n}`) },
      update: {},
      create: {
        id: id(`channel-${n}`),
        clientId: id(`client-${n}`),
        type: "EMAIL",
        target: `volume-${n}@example.com`,
        isActive: false,
      },
    });
  }

  for (let n = 0; n < 1000; n++) {
    const topic =
      topics[n % topics.length] ?? "Security review";

    const title =
      `[DEMO VOLUME ${String(n + 1).padStart(4, "0")}] ` +
      topic;

    const sourceUrl =
      `https://volume-news.example.com/stories/${n + 1}`;

    const createdAt = demoDate(n);

    await db.feedItem.upsert({
      where: { id: id(`item-${n}`) },
      update: {},
      create: {
        id: id(`item-${n}`),
        feedId: id(`feed-${n % 5}`),
        guid: `volume-v2-${n}`,
        title,
        url: sourceUrl,
        publishedAt: createdAt,
        createdAt,
        status:
          n < 250
            ? "TAKEN"
            : n % 3 === 0
              ? "VIEWED"
              : "UNREVIEWED",
        raw: {
          demo: true,
          summary:
            "Fictional security news for local development.",
        },
      },
    });

    if (n < 250) {
      const ticketId = id(`ticket-${n}`);

      const status =
        (["OPEN", "RESEARCH", "READY", "SENT", "CLOSED"] as const)[
          n % 5
        ] ?? "OPEN";

      await db.$transaction(
        async (tx) => {
          await tx.ticket.upsert({
            where: { id: ticketId },
            update: {},
            create: {
              id: ticketId,
              feedItemId: id(`item-${n}`),
              takenById: actor.id,
              title,
              origin: "AUTO_FEED",
              status,
              findingType: "OTHER",
              tlp: "GREEN",
              summary:
                "Fictional report for UI development; not a real incident.",
              overview:
                `Fictional ${topic} in a training environment.`,
              description:
                "Simulated observations for reviewing editor layouts, AI suggestions, IOC imports and exports. No live threat activity is represented.",
              recommendations:
                "- Review account access.\n" +
                "- Apply approved updates.\n" +
                "- Validate monitoring coverage.",
              cveIds: [],
              references: [sourceUrl],
              createdAt,
            },
          });

          await tx.ticketSource.upsert({
            where: { id: id(`source-${n}`) },
            update: {},
            create: {
              id: id(`source-${n}`),
              ticketId,
              url: sourceUrl,
              title: "Fictional source report",
              notes:
                "Simulated source notes for local testing.",
              createdById: actor.id,
              createdAt,
            },
          });

          const indicators = [
            {
              type: "DOMAIN" as const,
              value: `demo-${n}.example.com`,
              context:
                "Simulated infrastructure for a training investigation.",
            },
            {
              type: "IPV4" as const,
              value: `192.0.2.${n + 1}`,
              context:
                "Documentation-only address; simulated network indicator.",
            },
            {
              type: "SHA256" as const,
              value: createHash("sha256")
                .update(`volume-artifact-${n}`)
                .digest("hex"),
              context:
                "Hash of synthetic text, not a malware sample.",
            },
          ];

          for (const ioc of indicators) {
            await tx.ioc.upsert({
              where: {
                id: id(`ioc-${n}-${ioc.type}`),
              },
              update: {},
              create: {
                id: id(`ioc-${n}-${ioc.type}`),
                ticketId,
                ...ioc,
                origin: "DEMO_VOLUME",
                createdById: actor.id,
                includeInBulletin: true,
                createdAt,
              },
            });
          }

          if (
            status === "OPEN" ||
            status === "RESEARCH"
          ) {
            for (const field of [
              "overview",
              "description",
              "recommendations",
              "references",
            ]) {
              await tx.aiSuggestion.upsert({
                where: {
                  id: id(`suggestion-${n}-${field}`),
                },
                update: {},
                create: {
                  id: id(`suggestion-${n}-${field}`),
                  ticketId,
                  status: "PENDING",
                  origin: n % 2 ? "SOURCE_DRAFT" : "FILL",
                  provider: "OPENAI",
                  model: "demo-fixture",
                  content: JSON.stringify({
                    field,
                    currentValue: null,
                    suggestedValue:
                      field === "references"
                        ? sourceUrl
                        : `[DEMO] Suggested ${field}: review the fictional findings and verify the training indicators.`,
                  }),
                  createdAt,
                },
              });
            }
          }

          await tx.ticketActivity.upsert({
            where: { id: id(`activity-${n}`) },
            update: {},
            create: {
              id: id(`activity-${n}`),
              ticketId,
              actorId: actor.id,
              action: "CREATED",
              detail:
                "Demo volume fixture created for local development.",
              createdAt,
            },
          });

          if (
            status === "SENT" ||
            status === "CLOSED"
          ) {
            for (let c = 0; c < 3; c++) {
              const simulatedFailure =
                c === 2 && n % 3 === 0;

              await tx.deliveryAudit.upsert({
                where: {
                  id: id(`delivery-${n}-${c}`),
                },
                update: {},
                create: {
                  id: id(`delivery-${n}-${c}`),
                  ticketId,
                  channelId: id(`channel-${(n + c) % 5}`),
                  sentById: actor.id,
                  status: simulatedFailure
                    ? "FAILED"
                    : "SENT",
                  payload:
                    "SIMULATED delivery record. Nothing was sent.",
                  error: simulatedFailure
                    ? "Simulated failure; no delivery attempted."
                    : null,
                  createdAt,
                },
              });
            }
          }
        },
        { timeout: 15000 },
      );
    }

    if ((n + 1) % 100 === 0) {
      console.log(
        `Processed ${n + 1}/1000 feed fixtures…`,
      );
    }
  }

  console.log(
    "Ready: 1,000 feed items, 250 tickets, 750 IOCs, " +
      "400 suggestion fixtures, 300 simulated deliveries, " +
      "and 5 clients/channels in this fixture set.",
  );

  console.log(
    "Existing accounts, passwords and edits retained. " +
      "Reruns do not duplicate the same fixtures. " +
      "No messages were sent.",
  );
}

try {
  await main();
} finally {
  await db.$disconnect();
}