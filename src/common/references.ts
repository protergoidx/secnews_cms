import { AppError } from "./errors.js";

function parseReference(line: string): string | null {
  const trimmed = line.trim();

  if (trimmed === "") {
    return null;
  }

  // Mendukung:
  // https://example.com/article
  // - https://example.com/article
  // 1. https://example.com/article
  // [Article title](https://example.com/article)
  // <https://example.com/article>
  let value = trimmed.replace(
    /^(?:[-*•]\s+|\d+[.)]\s+)/,
    "",
  );

  const markdown = value.match(
    /^\[[^\]]*\]\((https?:\/\/.+)\)$/i,
  );

  if (markdown) {
    value = markdown[1] ?? "";
  } else if (
    value.startsWith("<") &&
    value.endsWith(">")
  ) {
    value = value.slice(1, -1);
  }

  value = value.trim();

  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return null;
    }

    // URL() juga menolak sebagian input tidak valid.
    // Spasi mentah tetap ditolak agar kalimat bukan
    // dianggap sebagai satu alamat.
    if (/\s/.test(value)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function referenceKey(value: string): string {
  try {
    const url = new URL(value);

    // Fragmen hanya menunjuk bagian halaman yang sama.
    url.hash = "";

    // URL() menormalkan hostname dan default port.
    // Path dan query tetap dipertahankan.
    return url.href;
  } catch {
    return value.trim();
  }
}

export function mergeReferences(
  existing: readonly string[],
  suggestedText: string,
): string[] {
  const additions: string[] = [];
  const invalid: string[] = [];

  for (const line of suggestedText
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (line.trim() === "") {
      continue;
    }

    const reference = parseReference(line);

    if (reference === null) {
      invalid.push(line.trim());
    } else {
      additions.push(reference);
    }
  }

  if (invalid.length > 0) {
    throw new AppError(
      "VALIDATION",
      "References were not accepted. Use one HTTP/HTTPS URL per line. Remove headings or explanatory text.",
      {
        invalid: invalid
          .slice(0, 5)
          .map((line) => line.slice(0, 200)),
      },
      422,
    );
  }

  const seen = new Set<string>();
  const merged: string[] = [];

  // Referensi lama tetap dipertahankan.
  // Hanya referensi baru yang wajib lolos validasi di atas.
  for (const reference of [...existing, ...additions]) {
    const trimmed = reference.trim();

    if (trimmed === "") {
      continue;
    }

    const key = referenceKey(trimmed);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}