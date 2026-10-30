/**
 * Format satu rekomendasi per baris menjadi bullet.
 *
 * - Menyeragamkan "-", "*", "•", dan nomor daftar.
 * - Tidak menggandakan bullet.
 * - Mengabaikan baris kosong.
 * - Tidak memecah kalimat berdasarkan titik.
 */
export function formatRecommendations(
  input: string | null | undefined,
): string {
  if (!input) {
    return "";
  }

  return input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line !== "")
    .map((line: string): string => {
      const content = line
        .replace(
          /^(?:[-*•]\s+|\d+[.)]\s+)/,
          "",
        )
        .trim();

      if (
        content === "" ||
        /^[-*•]$/.test(content)
      ) {
        return "";
      }

      return `- ${content}`;
    })
    .filter((line: string): boolean => line !== "")
    .join("\n");
}