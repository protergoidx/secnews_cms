import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { AppError } from "../../common/errors.js";
import type { IocType } from "../../generated/prisma/enums.js";
import { previewMessageIocs } from "./ioc-text.routes.js";
import { normalizeIocValue } from "./validation.js";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({
  documents: z
    .array(
      z.object({
        filename: z.string().trim().min(1).max(255),
        text: z.string().min(1).max(200000),
      }),
    )
    .min(1)
    .max(100),
});
type Document = z.infer<typeof bodySchema>["documents"][number];
type Evidence = { filename: string; context: string; occurrences: number };
type Group = { type: IocType; value: string; evidence: Evidence[]; occurrences: number };

function keyOf(type: IocType, raw: string): string {
  const value = normalizeIocValue(type, raw);
  return `${type}:${["DOMAIN", "EMAIL", "MD5", "SHA1", "SHA256", "IPV6"].includes(type) ? value.toLowerCase() : value}`;
}

export function extractBatch(documents: Document[]) {
  let totalBytes = 0;
  let pairs = 0;
  const groups = new Map<string, Group>();
  for (const document of documents) {
    const bytes = Buffer.byteLength(document.text, "utf8");
    totalBytes += bytes;
    if (bytes > 200000 || totalBytes > 1000000)
      throw new AppError(
        "VALIDATION",
        "Maximum 200 KB per TXT and 1 MB of text per batch. Split the files into smaller batches.",
        undefined,
        400,
      );
    if (!/\.txt$/i.test(document.filename))
      throw new AppError("VALIDATION", "Only .txt documents are supported.", undefined, 400);
    const rows = previewMessageIocs(document.text, document.filename);
    pairs += rows.length;
    if (pairs > 5000)
      throw new AppError(
        "VALIDATION",
        "More than 5,000 file/IOC matches. Split the files into smaller batches.",
        undefined,
        400,
      );
    for (const row of rows) {
      const key = keyOf(row.type, row.value);
      let group = groups.get(key);
      if (!group) {
        if (groups.size >= 1000)
          throw new AppError(
            "VALIDATION",
            "More than 1,000 unique IOCs. Split the files into smaller batches.",
            undefined,
            400,
          );
        group = { type: row.type, value: row.value, evidence: [], occurrences: 0 };
        groups.set(key, group);
      }
      group.occurrences += row.occurrences;
      group.evidence.push({
        filename: document.filename,
        context: row.context,
        occurrences: row.occurrences,
      });
    }
  }
  return [...groups.values()].map((group) => {
    const context = group.evidence.map((item) => `${item.filename}: ${item.context}`).join("\n\n");
    return {
      type: group.type,
      value: group.value,
      context: context.slice(0, 5000),
      contextTruncated: context.length > 5000,
      filename: [...new Set(group.evidence.map((item) => item.filename))].join(", "),
      evidence: group.evidence,
      occurrences: group.occurrences,
    };
  });
}

export default async function iocTextBatchRoutes(app: FastifyInstance): Promise<void> {
  const f = app.withTypeProvider<ZodTypeProvider>();
  f.post(
    "/:id/iocs/text-batch-preview",
    {
      bodyLimit: 8000000,
      onRequest: [app.requireRole("ADMIN", "EDITOR", "ANALYST")],
      schema: { params: paramsSchema, body: bodySchema },
    },
    async (request) => {
      const { id } = paramsSchema.parse(request.params);
      const { documents } = bodySchema.parse(request.body);
      const ticket = await app.prisma.ticket.findUnique({ where: { id }, select: { id: true } });
      if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found.");
      let candidates: ReturnType<typeof extractBatch>;
      try {
        candidates = extractBatch(documents);
      } catch (caught) {
        if (caught instanceof AppError) throw caught;
        throw new AppError(
          "VALIDATION",
          caught instanceof Error ? caught.message : "Could not extract TXT files.",
          undefined,
          400,
        );
      }
      const existing = await app.prisma.ioc.findMany({
        where: { ticketId: id },
        select: { type: true, value: true },
      });
      const keys = new Set(existing.map((ioc) => keyOf(ioc.type, ioc.value)));
      return {
        rows: candidates.map((row) => ({ ...row, exists: keys.has(keyOf(row.type, row.value)) })),
        filesProcessed: documents.length,
      };
    },
  );
}
