import { z } from "zod/v4";
import {
  TicketStatus as PrismaTicketStatus,
  TicketOrigin as PrismaTicketOrigin,
  FindingType as PrismaFindingType,
  TlpLevel as PrismaTlpLevel,
  IocType as PrismaIocType,
  SuggestionStatus as PrismaSuggestionStatus,
} from "../../generated/prisma/enums.js";
import {
  paginated,
  pageQuery,
} from "../../common/pagination.js";
import {
  CVE_ID_PATTERN,
  iocValueProblem,
  normalizeIocValue,
} from "./validation.js";

// ---- Enums ----

export const TicketStatusEnum = z.enum(PrismaTicketStatus);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const TicketOriginEnum = z.enum(PrismaTicketOrigin);
export type TicketOrigin = z.infer<typeof TicketOriginEnum>;

export const FindingTypeEnum = z.enum(PrismaFindingType);
export type FindingType = z.infer<typeof FindingTypeEnum>;

export const TlpEnum = z.enum(PrismaTlpLevel);
export type Tlp = z.infer<typeof TlpEnum>;

export const IocTypeEnum = z.enum(PrismaIocType);
export type IocType = z.infer<typeof IocTypeEnum>;

export const SuggestionStatusEnum = z.enum(
  PrismaSuggestionStatus,
);
export type SuggestionStatus = z.infer<
  typeof SuggestionStatusEnum
>;

// ---- Entities ----

const cveId = z.string().regex(
  CVE_ID_PATTERN,
  "CVE-YYYY-NNNNN",
);

export const TicketSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  origin: TicketOriginEnum,
  findingType: FindingTypeEnum,
  status: TicketStatusEnum,

  cveIds: z.array(cveId).default([]),
  affectedProduct: z.string().nullable(),
  affectedVersions: z.string().nullable(),
  mitigation: z.string().nullable(),
  threatName: z.string().nullable(),

  overview: z.string().nullable(),
  description: z.string().nullable(),
  recommendations: z.string().nullable(),
  references: z.array(z.url()).default([]),

  tlp: TlpEnum.default("AMBER"),
  feedItemId: z.uuid().nullable(),
  otxPulseId: z.string().nullable(),
  otxPulseUrl: z.url().nullable(),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  takenByName: z.string().nullable(),
});

export type Ticket = z.infer<typeof TicketSchema>;

export const TicketSourceSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  url: z.url().nullable(),
  note: z.string().nullable(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  createdById: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type TicketSource = z.infer<
  typeof TicketSourceSchema
>;

export const IocSchema = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  type: IocTypeEnum,
  value: z.string().min(1).max(512),
  context: z.string().nullable(),
  origin: z.string().nullable(),
  includeInBulletin: z.boolean(),
  createdById: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type Ioc = z.infer<typeof IocSchema>;

export const TicketDetailSchema = TicketSchema.extend({
  sources: z.array(TicketSourceSchema),
  iocs: z.array(IocSchema),
  pendingSuggestions: z.number().int().min(0),
});

export type TicketDetail = z.infer<
  typeof TicketDetailSchema
>;

// ---- Ticket requests ----

export const CreateTicketBodySchema = z.discriminatedUnion(
  "findingType",
  [
    z.object({
      findingType: z.literal("VULNERABILITY_CVE"),
      title: z.string().min(1),
      summary: z.string().optional(),
      cveIds: z.array(z.string()).optional(),
      affectedProduct: z.string().min(1).optional(),
      affectedVersions: z.string().min(1).optional(),
      mitigation: z.string().optional(),
    }),

    z.object({
      findingType: z.literal("THREAT_CAMPAIGN"),
      title: z.string().min(1),
      summary: z.string().optional(),
      threatName: z.string().min(1).optional(),
    }),

    z.object({
      findingType: z.literal("OTHER"),
      title: z.string().min(1),
      summary: z.string().optional(),
    }),
  ],
);

export type CreateTicketBody = z.infer<
  typeof CreateTicketBodySchema
>;

export const UpdateTicketBodySchema = z
  .object({
    title: z.string().min(1).optional(),
  })
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: "At least one field required" },
  );

export const TransitionBodySchema = z.object({
  to: TicketStatusEnum,
});

export const PatchTicketFieldsBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    overview: z.string().optional(),
    description: z.string().optional(),
    recommendations: z.string().optional(),
    references: z.array(z.url()).optional(),
    cveIds: z.array(z.string()).optional(),
    tlp: TlpEnum.optional(),
  })
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: "At least one field required" },
  );

export type PatchTicketFieldsBody = z.infer<
  typeof PatchTicketFieldsBodySchema
>;

// ---- Sources ----

export const CreateTicketSourceBodySchema = z
  .object({
    url: z.url().optional(),
    note: z.string().min(1).optional(),
    title: z.string().min(1).max(500).optional(),
    notes: z.string().min(1).max(5000).optional(),
  })
  .refine(
    (body) =>
      body.url !== undefined ||
      body.title !== undefined ||
      body.note !== undefined ||
      body.notes !== undefined,
    {
      message: "url, title, note, or notes required",
    },
  );

export const UpdateTicketSourceBodySchema = z
  .object({
    url: z.url().nullable().optional(),
    note: z.string().min(1).nullable().optional(),
    title: z.string().min(1).max(500).nullable().optional(),
    notes: z.string().min(1).max(5000).nullable().optional(),
  })
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: "At least one field required" },
  );

// ---- IOC requests ----

// Normalize defanged input before validating its declared type.
export const CreateIocBodySchema = z
  .object({
    type: IocTypeEnum,
    value: z.string().min(1).max(512),
    context: z.string().optional(),
    origin: z.string().optional(),
    includeInBulletin: z.boolean().default(true),
  })
  .transform((body) => ({
    ...body,
    value: normalizeIocValue(body.type, body.value),
  }))
  .superRefine(({ type, value }, ctx) => {
    const problem = iocValueProblem(type, value);

    if (problem !== null) {
      ctx.addIssue({
        code: "custom",
        message: problem,
        path: ["value"],
      });
    }
  });

export type CreateIocBody = z.infer<
  typeof CreateIocBodySchema
>;

// The stored type is retrieved in the PATCH route.
// Normalization and type-specific validation happen there.
export const UpdateIocBodySchema = z
  .object({
    value: z.string().min(1).max(512).optional(),
    context: z.string().optional(),
    origin: z.string().optional(),
    includeInBulletin: z.boolean().optional(),
  })
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: "At least one field required" },
  );

// ---- Route parameters ----

export const UuidIdParamSchema = z.object({
  id: z.uuid(),
});

export const IocIdParamSchema = z.object({
  id: z.uuid(),
  iocId: z.uuid(),
});

export const SourceIdParamSchema = z.object({
  id: z.uuid(),
  sourceId: z.uuid(),
});

// ---- Ticket list ----

export const ListTicketsQuerySchema = pageQuery
  .extend({
    q: z.string().min(1).optional(),
    status: TicketStatusEnum.optional(),
    origin: TicketOriginEnum.optional(),
    findingType: FindingTypeEnum.optional(),
    from: z.union([
      z.iso.date(),
      z.iso.datetime(),
    ]).optional(),
    to: z.union([
      z.iso.date(),
      z.iso.datetime(),
    ]).optional(),
  })
  .refine(
    ({ from, to }) =>
      from === undefined ||
      to === undefined ||
      dateBound(from, false) <= dateBound(to, true),
    {
      message: "from must be before or equal to to",
      path: ["from"],
    },
  );

export function dateBound(
  value: string,
  endOfDay: boolean,
): Date {
  return value.length === 10
    ? new Date(
        `${value}T${
          endOfDay ? "23:59:59.999" : "00:00:00.000"
        }Z`,
      )
    : new Date(value);
}

export const ListTicketsResponseSchema =
  paginated(TicketSchema);