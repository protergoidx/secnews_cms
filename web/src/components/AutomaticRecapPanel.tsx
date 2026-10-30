import { useState } from "react";
import { apiFetch } from "../lib/api";

type RankedStory = {
  id: string;
  title: string;
  status: string;
  overview: string;
  references: string[];
  createdAt: string;
  score: number;
  reasons: string[];
};

type RecapResult = {
  month: string;
  items: RankedStory[];
  examined: number;
  eligible: number;
  method: string;
  criteria: string[];
  note: string;
};

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

function makeDraft(data: RecapResult): string {
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(`${data.month}-01T00:00:00Z`),
  );

  return [
    `SecNews Recap — ${monthLabel}`,
    "",
    ...data.items.map((story, index) => {
      const references = [
        ...new Set(
          story.references
            .map((reference) => reference.trim())
            .filter(Boolean),
        ),
      ];

      return [
        `${index + 1}. ${story.title}`,
        "",
        story.overview,
        ...(references.length > 0
          ? ["", "References:", ...references]
          : []),
        "",
      ].join("\n");
    }),
  ].join("\n");
}

export function AutomaticRecapPanel() {
  const today = new Date();

  const [month, setMonth] = useState(
    `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}`,
  );

  const [result, setResult] =
    useState<RecapResult | null>(null);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 2000 &&
    Number(month.slice(0, 4)) <= 9998;

  async function load(): Promise<void> {
    if (busy || copying || !validMonth) return;

    setBusy(true);
    setError("");
    setMessage("");
    setResult(null);
    setDraft("");

    try {
      const params = new URLSearchParams({ month });

      const response = await apiFetch(
        `/tools/recap-top?${params.toString()}`,
      );

      const data =
        (await response.json()) as RecapResult;

      setResult(data);
      setDraft(
        data.items.length > 0 ? makeDraft(data) : "",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not build the recap.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    if (copying || draft.trim() === "") return;

    setCopying(true);
    setMessage("");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable.");
      }

      await navigator.clipboard.writeText(draft);
      setMessage("Recap copied.");
    } catch {
      setMessage(
        "Copy is unavailable here. Select the preview text to copy it, or download TXT.",
      );
    } finally {
      setCopying(false);
    }
  }

  function download(): void {
    if (!result || draft.trim() === "") return;

    const blob = new Blob([draft], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download =
      `secnews-auto-recap-${result.month}.txt`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Automatic monthly top 5
      </h2>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        Select up to five stories automatically using
        an editorial readiness score. Review the draft
        before sharing. No AI key is required.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">
            Month
          </span>

          <input
            aria-label="Automatic recap month"
            type="month"
            min="2000-01"
            max="9998-12"
            value={month}
            disabled={busy || copying}
            className={inputClass}
            onChange={(event) => {
              setMonth(event.target.value);
              setResult(null);
              setDraft("");
              setError("");
              setMessage("");
            }}
          />
        </label>

        <button
          type="button"
          disabled={busy || copying || !validMonth}
          onClick={() => void load()}
          className={buttonClass}
        >
          {busy
            ? "Ranking stories…"
            : "Generate automatic top 5"}
        </button>
      </div>

      {error !== "" ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <>
          <p
            role="status"
            className="mt-4 text-sm text-slate-700"
          >
            {result.items.length} selected from{" "}
            {result.eligible} eligible stories ·{" "}
            {result.examined} tickets examined
          </p>

          <details className="mt-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium">
              How the ranking works
            </summary>

            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.criteria.map((criterion) => (
                <li key={criterion}>
                  {criterion}
                </li>
              ))}
            </ul>

            <p className="mt-2 leading-5">
              {result.note}
            </p>
          </details>

          {result.items.length > 0 ? (
            <>
              <ol className="mt-4 space-y-2">
                {result.items.map((story, index) => (
                  <li
                    key={story.id}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {index + 1}. {story.title}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {story.status} · Editorial score{" "}
                      {story.score}/100
                    </p>

                    <details className="mt-2 text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        Why this story
                      </summary>

                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {story.reasons.map((reason) => (
                          <li key={reason}>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ol>

              {result.items.length < 5 ? (
                <p className="mt-3 text-xs text-amber-600">
                  Only {result.items.length} eligible
                  stories were available. The recap
                  contains that number of stories.
                </p>
              ) : null}

              <label className="mt-4 block">
                <span className="text-xs font-medium text-slate-700">
                  Review and edit recap
                </span>

                <textarea
                  aria-label="Automatic recap preview"
                  rows={16}
                  value={draft}
                  disabled={copying}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setMessage("");
                  }}
                  className={`${inputClass} mt-2 w-full resize-y leading-6`}
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    copying || draft.trim() === ""
                  }
                  onClick={() => void copy()}
                  className={buttonClass}
                >
                  {copying ? "Copying…" : "Copy recap"}
                </button>

                <button
                  type="button"
                  disabled={
                    copying || draft.trim() === ""
                  }
                  onClick={download}
                  className={secondaryClass}
                >
                  Download TXT
                </button>

                <button
                  type="button"
                  disabled={copying}
                  onClick={() => {
                    setDraft(makeDraft(result));
                    setMessage("");
                  }}
                  className={secondaryClass}
                >
                  Reset preview
                </button>
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                Draft edits are local to this page.
                Copy or download before leaving.
                Use the manual recap section below
                to choose different stories.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No eligible stories for this month.
              Only READY, SENT, or CLOSED tickets
              with a title and overview/summary
              are included.
            </p>
          )}
        </>
      ) : null}

      {message !== "" ? (
        <p
          role="status"
          className="mt-3 text-sm text-slate-600"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}