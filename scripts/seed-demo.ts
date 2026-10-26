import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

// Local demo data only. Stable IDs make reruns additive, without resetting edits.
const connection = new URL(process.env["DATABASE_URL"] ?? "postgresql://invalid");
if (process.env["APP_ENV"] !== "development" ||
    !["db", "localhost", "127.0.0.1"].includes(connection.hostname) ||
    connection.pathname !== "/secnews_dev") {
  throw new Error("Use APP_ENV=development and a local secnews_dev database only.");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connection.toString() }) });
function id(key: string): string {
  const h = createHash("sha256").update(`secnews-ui-demo-v1:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const password = randomBytes(18).toString("base64url");
const passwordHash = await bcrypt.hash(password, 10);
const createdAccounts: string[] = [];
const now = new Date();
const date = (days: number) => new Date(now.getTime() - days * 86400000);

try {
  await db.$transaction(async (tx) => {
    for (const role of ["ADMIN", "EDITOR", "ANALYST"] as const) {
      const email = `demo.${role.toLowerCase()}@example.com`;
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        if (existing.id !== id(role)) throw new Error(`Demo email already belongs to another user: ${email}`);
        continue;
      }
      await tx.user.create({ data: { id: id(role), email, name: `Demo ${role}`, role, passwordHash } });
      createdAccounts.push(email);
    }
    for (let n = 0; n < 3; n++) {
      await tx.feedSource.upsert({ where: { id: id(`feed-${n}`) }, update: {}, create: {
        id: id(`feed-${n}`), name: `[DEMO] Security source ${n + 1}`,
        url: `https://source-${n + 1}.example.com/rss`, isActive: false,
      } });
    }
    const stories = ["Phishing campaign targeting employee accounts", "Suspicious domain investigation", "Security update for demo gateway", "Credential theft awareness bulletin", "Ransomware readiness exercise"];
    for (let n = 0; n < 18; n++) {
      await tx.feedItem.upsert({ where: { id: id(`item-${n}`) }, update: {}, create: {
        id: id(`item-${n}`), feedId: id(`feed-${n % 3}`), guid: `demo-item-${n}`,
        title: `[DEMO] ${stories[n % 5]} — sample ${n + 1}`,
        url: `https://news.example.com/demo/${n + 1}`, publishedAt: date(n % 12), createdAt: date(n % 12),
        status: n < 5 ? "TAKEN" : n % 2 ? "UNREVIEWED" : "VIEWED",
        raw: { demo: true, summary: "Fictional story for local interface development." },
      } });
    }
    for (let n = 0; n < 5; n++) {
      const ticketId = id(`ticket-${n}`);
      const status =
        (["OPEN", "RESEARCH", "READY", "SENT", "CLOSED"] as const)[n] ?? "OPEN";
      await tx.ticket.upsert({ where: { id: ticketId }, update: {}, create: {
        id: ticketId, feedItemId: id(`item-${n}`), takenById: id("ANALYST"),
        title: `[DEMO] ${stories[n]}`, summary: "Fictional security bulletin for UI development; not a real incident.",
        origin: "AUTO_FEED", status, findingType: "OTHER", tlp: "GREEN",
        overview: "Demo overview: suspicious activity was identified in a fictional training environment.",
        description: "This sample contains fictional findings, source notes and documentation-only indicators. Use it to review long-form layouts, forms, filters and exports.",
        recommendations: "- Review account access.\n- Apply approved updates.\n- Monitor unusual authentication events.",
        references: [`https://news.example.com/demo/${n + 1}`], cveIds: [], createdAt: date(5 - n),
      } });
      await tx.ticketSource.upsert({ where: { id: id(`source-${n}`) }, update: {}, create: {
        id: id(`source-${n}`), ticketId, title: "Demo source report", url: `https://news.example.com/demo/${n + 1}`,
        notes: "Fictional source notes for testing Source Draft Assist selection and layout.", createdById: id("ANALYST"),
      } });
      const indicators = [
        { type: "DOMAIN" as const, value: `sample-${n}.example.com` },
        { type: "IPV4" as const, value: `192.0.2.${n + 1}` },
        { type: "SHA256" as const, value: createHash("sha256").update(`demo-${n}`).digest("hex") },
      ];
      for (const ioc of indicators) {
        await tx.ioc.upsert({ where: { id: id(`ioc-${n}-${ioc.type}`) }, update: {}, create: {
          id: id(`ioc-${n}-${ioc.type}`), ticketId, ...ioc, context: "Fictional demonstration indicator",
          origin: "DEMO", createdById: id("ANALYST"), includeInBulletin: true,
        } });
      }
      await tx.ticketActivity.upsert({ where: { id: id(`activity-${n}`) }, update: {}, create: {
        id: id(`activity-${n}`), ticketId, actorId: id("ANALYST"), action: "CREATED",
        detail: "Demo ticket created for local UI development.", createdAt: date(5 - n),
      } });
      if (n < 2) {
        for (const origin of ["FILL", "ENRICH", "SOURCE_DRAFT"] as const) {
          for (const field of ["overview", "description", "recommendations", "references"]) {
            await tx.aiSuggestion.upsert({ where: { id: id(`suggestion-${n}-${origin}-${field}`) }, update: {}, create: {
              id: id(`suggestion-${n}-${origin}-${field}`), ticketId, origin, status: "PENDING", provider: "OPENAI", model: "demo-fixture",
              content: JSON.stringify({ field, currentValue: null, suggestedValue: field === "references"
                ? `https://news.example.com/demo/${n + 1}`
                : `[DEMO ${origin}] Suggested ${field}: review authentication controls and investigate the fictional indicators before publishing this bulletin.` }),
            } });
          }
        }
      }
    }
    for (let n = 0; n < 3; n++) {
      await tx.client.upsert({ where: { id: id(`client-${n}`) }, update: {}, create: {
        id: id(`client-${n}`), name: `[DEMO] Client ${n + 1}`, contactEmail: `client-${n + 1}@example.com`,
      } });
      await tx.channel.upsert({ where: { id: id(`channel-${n}`) }, update: {}, create: {
        id: id(`channel-${n}`), clientId: id(`client-${n}`), type: "EMAIL", target: `client-${n + 1}@example.com`, isActive: false,
      } });
    }
    for (let n = 0; n < 3; n++) {
      await tx.deliveryAudit.upsert({ where: { id: id(`delivery-${n}`) }, update: {}, create: {
        id: id(`delivery-${n}`), ticketId: id("ticket-3"), channelId: id(`channel-${n}`),
        status: n === 2 ? "FAILED" : "SENT", error: n === 2 ? "Simulated failure; no delivery attempted." : null,
        payload: "DEMO audit fixture. No message was sent.", sentById: id("EDITOR"), createdAt: date(1),
      } });
    }
  }, { timeout: 60000 });
  console.log("Demo ready: 18 feed items, 5 tickets, 15 IOCs, 24 pending suggestions, 3 clients and 3 simulated delivery records.");
  if (createdAccounts.length) {
    console.log("New local demo accounts:", createdAccounts.join(", "));
    console.log("Password for these NEW accounts:", password);
  } else console.log("Existing demo accounts retained; passwords and edits unchanged.");
  console.log("Feeds/channels are inactive. AI suggestions are fixtures; actual generation needs a configured provider.");
} finally { await db.$disconnect(); }