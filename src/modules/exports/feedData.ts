import type { Prisma } from "../../generated/prisma/client.js";
import type {
  FeedItemStatus as PrismaFeedItemStatus,
} from "../../generated/prisma/enums.js";
import { prisma } from "../../lib/db.js";
import { dateBound } from "../tickets/schema.js";

export type FeedExportRowData = Prisma.FeedItemGetPayload<{
  include: {
    feed: {
      select: {
        name: true;
      };
    };
  };
}>;

export type FeedStatusBreakdown = Partial<
  Record<PrismaFeedItemStatus, number>
>;

export const FEED_EXPORT_BATCH_SIZE = 500;

function publishedWhere(
  from: string | undefined,
  to: string | undefined,
): Prisma.FeedItemWhereInput {
  if (from === undefined && to === undefined) {
    return {};
  }

  return {
    publishedAt: {
      ...(from === undefined
        ? {}
        : { gte: dateBound(from, false) }),
      ...(to === undefined
        ? {}
        : { lte: dateBound(to, true) }),
    },
  };
}

/**
 * Ambil feed items secara bertahap.
 * Title ditempatkan pertama tanpa membuang ID atau data lainnya.
 */
export async function* iterateFeedExportRows(
  from: string | undefined,
  to: string | undefined,
  batchSize: number = FEED_EXPORT_BATCH_SIZE,
): AsyncGenerator<FeedExportRowData> {
  const where = publishedWhere(from, to);
  let cursorId: string | undefined;

  for (;;) {
    const batch: FeedExportRowData[] =
      await prisma.feedItem.findMany({
        where,
        include: {
          feed: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
        ...(cursorId === undefined
          ? {}
          : {
              cursor: { id: cursorId },
              skip: 1,
            }),
        take: batchSize,
      });

    for (const row of batch) {
      const { title, ...rest } = row;

      yield {
        title,
        ...rest,
      };
    }

    const last = batch.at(-1);

    if (
      batch.length < batchSize ||
      last === undefined
    ) {
      return;
    }

    cursorId = last.id;
  }
}

/** Hitung jumlah feed items per status pada periode yang sama. */
export async function feedStatusBreakdown(
  from: string | undefined,
  to: string | undefined,
): Promise<FeedStatusBreakdown> {
  const rows = await prisma.feedItem.groupBy({
    by: ["status"],
    where: publishedWhere(from, to),
    _count: {
      _all: true,
    },
  });

  const breakdown: FeedStatusBreakdown = {};

  for (const row of rows) {
    breakdown[row.status] = row._count._all;
  }

  return breakdown;
}