import type { IocType } from "../../generated/prisma/enums.js";

export const DEFAULT_TEMPLATE = [
  "Security Bulletin: {{title}}",
  "",
  "Overview:",
  "{{overview}}",
  "",
  "Description:",
  "{{description}}",
  "",
  "Indicators of Compromise:",
  "{{ioc_block}}",
  "",
  "Recommendations:",
  "{{recommendations}}",
  "",
  "References:",
  "{{references}}",
].join("\n");

export const DEFAULT_TEMPLATE_NAME = "default";

export const REQUIRED_PREVIEW_FIELDS = [
  "overview",
  "description",
] as const;

export type RequiredPreviewField =
  (typeof REQUIRED_PREVIEW_FIELDS)[number];

export type BulletinIoc = {
  type: IocType;
  value: string;
  includeInBulletin: boolean;
};

export type BulletinData = {
  title: string;
  overview: string | null;
  description: string | null;
  recommendations: string | null;
  references: string[];
  iocs: BulletinIoc[];
};

function nonBlank(value: string | null): string {
  if (value === null || value.trim() === "") {
    return "";
  }

  return value;
}

/** Format IOC untuk ditampilkan dalam bulletin. */
export function defangIoc(
  type: IocType,
  value: string,
): string {
  switch (type) {
    case "DOMAIN":
    case "IPV4":
      return value.replaceAll(".", "[.]");

    case "IPV6":
      return value.replaceAll(":", "[:]");

    case "URL":
      return value
        .replace(/^http:\/\//, "hxxp://")
        .replace(/^https:\/\//, "hxxps://")
        .replaceAll(".", "[.]");

    case "EMAIL":
      return value
        .replaceAll("@", "(at)")
        .replaceAll(".", "[.]");

    case "MD5":
    case "SHA1":
    case "SHA256":
    case "FILEPATH":
    case "MUTEX":
    case "CIDR":
    case "OTHER":
      return value;

    default: {
      const unreachable: never = type;
      return unreachable;
    }
  }
}

/** Field wajib yang belum diisi untuk preview bulletin. */
export function missingPreviewFields(
  data: BulletinData,
): RequiredPreviewField[] {
  const empty: Record<RequiredPreviewField, string> = {
    overview: nonBlank(data.overview),
    description: nonBlank(data.description),
  };

  return REQUIRED_PREVIEW_FIELDS.filter(
    (field) => empty[field] === "",
  );
}

const IOC_GROUP_LABELS: Record<IocType, string> = {
  DOMAIN: "Domain",
  IPV4: "IPv4",
  IPV6: "IPv6",
  URL: "URL",
  EMAIL: "Email",
  MD5: "Hash",
  SHA1: "Hash",
  SHA256: "Hash",
  FILEPATH: "File path",
  MUTEX: "Mutex",
  CIDR: "CIDR",
  OTHER: "Other",
};

/**
 * Kelompokkan IOC berdasarkan jenis.
 * MD5, SHA1, dan SHA256 masuk kelompok Hash.
 * Hanya IOC dengan includeInBulletin aktif yang ditampilkan.
 */
export function renderIocBlock(
  iocs: BulletinIoc[],
): string {
  const groups = new Map<string, Set<string>>();

  for (const ioc of iocs) {
    if (!ioc.includeInBulletin) {
      continue;
    }

    const label = IOC_GROUP_LABELS[ioc.type];
    const value = defangIoc(ioc.type, ioc.value);

    const values = groups.get(label) ?? new Set<string>();
    values.add(value);
    groups.set(label, values);
  }

  return [...groups.entries()]
    .map(
      ([label, values]) =>
        `${label}\n${[...values].join("\n")}`,
    )
    .join("\n\n");
}

type SectionValues = Record<
  | "title"
  | "overview"
  | "description"
  | "ioc_block"
  | "recommendations"
  | "references",
  string
>;

function sectionValues(
  data: BulletinData,
): SectionValues {
  return {
    title: data.title,
    overview: nonBlank(data.overview),
    description: nonBlank(data.description),
    recommendations: nonBlank(data.recommendations),
    references: data.references.join("\n"),
    ioc_block: renderIocBlock(data.iocs),
  };
}

const PLACEHOLDER =
  /\{\{(title|overview|description|ioc_block|recommendations|references)\}\}/g;

function placeholderKeys(
  line: string,
): (keyof SectionValues)[] {
  const found = line.match(PLACEHOLDER);

  return (found ?? []).map(
    (name) =>
      name.slice(2, -2) as keyof SectionValues,
  );
}

/**
 * Isi placeholder template.
 * Section kosong dihilangkan bersama labelnya.
 */
export function renderBulletin(
  template: string,
  data: BulletinData,
): string {
  const values = sectionValues(data);
  const output: string[] = [];

  for (const line of template.split("\n")) {
    const keys = placeholderKeys(line);

    if (
      keys.length > 0 &&
      keys.every((key) => values[key] === "")
    ) {
      const previous = output[output.length - 1];

      if (
        previous !== undefined &&
        previous.trimEnd().endsWith(":")
      ) {
        output.pop();
      }

      continue;
    }

    output.push(
      line.replace(
        PLACEHOLDER,
        (_match, key: keyof SectionValues) =>
          values[key],
      ),
    );
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}