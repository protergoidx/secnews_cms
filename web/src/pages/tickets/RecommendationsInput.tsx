import {
  useRef,
  type KeyboardEvent,
} from "react";

interface RecommendationsInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Satu baris menjadi satu rekomendasi.
 * Bullet lama diseragamkan tanpa menggandakannya.
 * Tidak memecah paragraf berdasarkan titik.
 */
export function formatRecommendations(
  input: string,
): string {
  return input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
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
    .filter((line) => line !== "")
    .join("\n");
}

export function RecommendationsInput({
  value,
  onChange,
  disabled = false,
  className,
}: RecommendationsInputProps) {
  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  function restoreCaret(position: number): void {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(
        position,
        position,
      );
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStart =
      value.lastIndexOf("\n", start - 1) + 1;

    const nextNewline = value.indexOf("\n", start);

    const lineEnd =
      nextNewline === -1
        ? value.length
        : nextNewline;

    const wholeLine = value.slice(
      lineStart,
      lineEnd,
    );

    // Enter pada bullet kosong: hapus bullet,
    // sehingga pengguna bisa keluar dari daftar.
    if (
      start === end &&
      /^\s*[-*•]\s*$/.test(wholeLine)
    ) {
      event.preventDefault();

      const nextValue =
        value.slice(0, lineStart) +
        value.slice(lineEnd);

      onChange(nextValue);
      restoreCaret(lineStart);
      return;
    }

    event.preventDefault();

    const before = value.slice(0, start);
    const after = value.slice(end);

    const currentPrefix = value.slice(
      lineStart,
      start,
    );

    const needsFirstBullet =
      currentPrefix.trim() !== "" &&
      !/^\s*[-*•]\s/.test(currentPrefix);

    const prefix = needsFirstBullet
      ? `${before.slice(0, lineStart)}- ${before.slice(lineStart)}`
      : before;

    const insertion = "\n- ";

    onChange(prefix + insertion + after);
    restoreCaret(prefix.length + insertion.length);
  }

  return (
    <div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">
          Recommendations
        </span>

        <textarea
          ref={textareaRef}
          aria-label="Recommendations"
          aria-describedby="recommendations-help"
          rows={8}
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            const current = event.currentTarget.value;
            const formatted =
              formatRecommendations(current);

            if (formatted !== current) {
              onChange(formatted);
            }
          }}
          placeholder={
            "- Review account access.\n- Apply approved updates.\n- Monitor unusual authentication events."
          }
          className={
            className ??
            "min-h-44 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:opacity-50"
          }
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          id="recommendations-help"
          className="text-xs leading-5 text-slate-500"
        >
          One recommendation per line. Enter continues
          the list; Enter on an empty bullet ends it.
          Shift+Enter inserts a plain line break.
        </p>

        <button
          type="button"
          disabled={disabled || value.trim() === ""}
          onClick={() =>
            onChange(formatRecommendations(value))
          }
          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Format bullets
        </button>
      </div>
    </div>
  );
}