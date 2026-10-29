import type { IocType } from "../../generated/prisma/enums.js";
import {
  iocValueProblem,
  normalizeIocValue,
} from "./validation.js";

export type DocumentText = {
  sourceId: string;
  filename: string;
  text: string;
  page?: number;
  sheet?: string;
};

export type IocEvidence = {
  sourceId: string;
  filename: string;
  page?: number;
  sheet?: string;
  line: number;
  originalValue: string;
  context: string;
};

export type ExtractedIoc = {
  type: IocType;
  value: string;
  evidence: IocEvidence[];
};

const DOT = String.raw`(?:\.|\[\.\]|\(\.\))`;

const LABEL =
  String.raw`[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?`;

const HOST = String.raw`(?:${LABEL}${DOT})+[a-z]{2,63}`;

const IP = String.raw`(?:\d{1,3}${DOT}){3}\d{1,3}`;

const COLON = String.raw`(?::|\[:\])`;

const IPV6 =
  String.raw`(?:[a-f0-9]{0,4}${COLON}){2,}[a-f0-9:.\[\]]*`;

type ExtractionRule = {
  type: IocType;
  pattern: RegExp;
};

// Prioritas ini mencegah domain/IP di dalam URL atau email
// ikut dimasukkan sebagai IOC terpisah.
const RULES: ExtractionRule[] = [
  {
    type: "URL",
    pattern: /\b(?:https?|hxxps?):\/\/[^\s<>"']+/gi,
  },
  {
    type: "EMAIL",
    pattern: new RegExp(
      String.raw`(?<![a-z0-9._%+-])[a-z0-9._%+-]+(?:@|\(at\)|\[at\])${HOST}(?![a-z0-9_-])`,
      "gi",
    ),
  },
  {
    type: "CIDR",
    pattern: new RegExp(
      String.raw`(?<![a-z0-9])(?:${IP}|${IPV6})\/\d{1,3}(?!\d)`,
      "gi",
    ),
  },
  {
    type: "IPV4",
    pattern: new RegExp(
      String.raw`(?<![a-z0-9])${IP}(?![a-z0-9])`,
      "gi",
    ),
  },
  {
    type: "IPV6",
    pattern: new RegExp(
      String.raw`(?<![a-z0-9:])${IPV6}(?![a-z0-9:])`,
      "gi",
    ),
  },
  {
    type: "SHA256",
    pattern: /(?<![a-z0-9])[a-f0-9]{64}(?![a-z0-9])/gi,
  },
  {
    type: "SHA1",
    pattern: /(?<![a-z0-9])[a-f0-9]{40}(?![a-z0-9])/gi,
  },
  {
    type: "MD5",
    pattern: /(?<![a-z0-9])[a-f0-9]{32}(?![a-z0-9])/gi,
  },
  {
    type: "DOMAIN",
    pattern: new RegExp(
      String.raw`(?<![a-z0-9_-])${HOST}(?![a-z0-9_-])`,
      "gi",
    ),
  },
];

function canonical(type: IocType, raw: string): string {
  const value = normalizeIocValue(type, raw);

  const caseInsensitiveTypes: readonly string[] = [
    "DOMAIN",
    "EMAIL",
    "MD5",
    "SHA1",
    "SHA256",
    "IPV6",
  ];

  return caseInsensitiveTypes.includes(type)
    ? value.toLowerCase()
    : value;
}

function excerpt(
  text: string,
  start: number,
  end: number,
): string {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextLine = text.indexOf("\n", end);

  const lineEnd =
    nextLine === -1 ? text.length : nextLine;

  return text
    .slice(
      Math.max(lineStart, start - 220),
      Math.min(lineEnd, end + 220),
    )
    .trim();
}

export function extractDocumentIocs(
  chunks: DocumentText[],
): ExtractedIoc[] {
  const results = new Map<string, ExtractedIoc>();

  let occurrences = 0;

  for (const chunk of chunks) {
    if (chunk.text.length > 1_000_000) {
      throw new Error(
        "Document text chunk exceeds 1,000,000 characters. Split it into smaller batches.",
      );
    }

    const occupied: [number, number][] = [];
    const lineStarts: number[] = [0];

    for (let n = 0; n < chunk.text.length; n++) {
      if (chunk.text[n] === "\n") {
        lineStarts.push(n + 1);
      }
    }

    const lineNumber = (offset: number): number => {
      let lo = 0;
      let hi = lineStarts.length;

      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);

        if ((lineStarts[mid] ?? 0) <= offset) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      return lo;
    };

    for (const rule of RULES) {
      const pattern = new RegExp(
        rule.pattern.source,
        rule.pattern.flags,
      );

      for (const match of chunk.text.matchAll(pattern)) {
        const start = match.index;
        let raw = match[0];

        if (rule.type === "IPV6") {
          raw = raw.replace(/\.+$/, "");
        }

        if (rule.type === "URL") {
          raw = raw
            .replace(/[.,;!?]+$/, "")
            .replace(/[)\]}]+$/, "");
        }

        const end = start + raw.length;

        const overlaps = occupied.some(
          ([left, right]: [number, number]): boolean =>
            start < right && end > left,
        );

        if (overlaps) {
          continue;
        }

        const value = canonical(rule.type, raw);

        if (
          value === "" ||
          iocValueProblem(rule.type, value) !== null
        ) {
          continue;
        }

        occupied.push([start, end]);

        const key = `${rule.type}:${value}`;

        let item = results.get(key);

        if (!item) {
          if (results.size >= 10000) {
            throw new Error(
              "More than 10,000 unique IOCs. Split the upload into smaller batches.",
            );
          }

          item = {
            type: rule.type,
            value,
            evidence: [],
          };

          results.set(key, item);
        }

        occurrences++;

        if (occurrences > 50000) {
          throw new Error(
            "More than 50,000 IOC occurrences. Split the upload into smaller batches.",
          );
        }

        item.evidence.push({
          sourceId: chunk.sourceId,
          filename: chunk.filename,
          ...(chunk.page === undefined
            ? {}
            : { page: chunk.page }),
          ...(chunk.sheet === undefined
            ? {}
            : { sheet: chunk.sheet }),
          line: lineNumber(start),
          originalValue: raw,
          context: excerpt(chunk.text, start, end),
        });
      }
    }
  }

  return [...results.values()];
}