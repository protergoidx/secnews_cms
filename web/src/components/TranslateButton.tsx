import { useId, useState } from "react";
import { apiFetch } from "../lib/api";

type Language = "Indonesian" | "English";

interface TranslateButtonProps {
  text: string;
  onApply: (translation: string) => void;
}

interface TranslationResponse {
  text: string;
  provider: string;
  model: string | null;
}

export function TranslateButton({
  text,
  onApply,
}: TranslateButtonProps) {
  const languageId = useId();

  const [language, setLanguage] =
    useState<Language>("Indonesian");

  const [translation, setTranslation] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sourceChanged = sourceText !== text;
  const tooLong = text.trim().length > 20000;

  async function translate(): Promise<void> {
    if (busy || text.trim() === "" || tooLong) {
      return;
    }

    setBusy(true);
    setError("");
    setTranslation("");
    setSourceText(text);

    try {
      const response = await apiFetch(
        "/tools/translate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            language,
          }),
        },
      );

      const data =
        (await response.json()) as TranslationResponse;

      if (
        typeof data.text !== "string" ||
        data.text.trim() === ""
      ) {
        throw new Error(
          "The provider returned an empty translation.",
        );
      }

      setTranslation(data.text);
    } catch (translationError) {
      setError(
        translationError instanceof Error
          ? translationError.message
          : "Translation failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function applyTranslation(): void {
    if (
      busy ||
      sourceChanged ||
      translation === ""
    ) {
      return;
    }

    onApply(translation);
    setTranslation("");
    setError("");
  }

  return (
    <div
      className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={languageId}
          className="text-xs font-medium text-slate-600"
        >
          Translate to
        </label>

        <select
          id={languageId}
          value={language}
          disabled={busy}
          onChange={(event) => {
            setLanguage(
              event.target.value as Language,
            );
            setTranslation("");
            setError("");
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
        >
          <option value="Indonesian">
            Indonesian
          </option>
          <option value="English">
            English
          </option>
        </select>

        <button
          type="button"
          disabled={
            busy ||
            text.trim() === "" ||
            tooLong
          }
          onClick={() => void translate()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Translating…" : "Translate"}
        </button>
      </div>

      {tooLong ? (
        <p className="mt-2 text-xs text-amber-700">
          Translation supports up to 20,000
          characters per request.
        </p>
      ) : null}

      {busy ? (
        <p
          role="status"
          className="mt-2 text-xs text-slate-500"
        >
          Preparing translation…
        </p>
      ) : null}

      {error !== "" ? (
        <p
          role="alert"
          className="mt-2 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}

      {translation !== "" ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold text-slate-700">
            Translation preview
          </p>

          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-3">
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
              {translation}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyTranslation}
              disabled={busy || sourceChanged}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply to draft
            </button>

            <button
              type="button"
              onClick={() => {
                setTranslation("");
                setError("");
              }}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              Discard
            </button>
          </div>

          <p
            className={`mt-2 text-xs ${
              sourceChanged
                ? "text-amber-700"
                : "text-slate-500"
            }`}
          >
            {sourceChanged
              ? "Source text changed. Translate again before applying."
              : "Review the translation before applying. Use the form’s Save button to save your changes."}
          </p>
        </div>
      ) : null}
    </div>
  );
}