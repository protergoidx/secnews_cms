import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import {
  addTicketSource,
  type TicketSource,
} from "../../lib/ticketsApi";

type RelatedItem = {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  score: number;
  reasons: string[];
};

type RelatedResponse = {
  items: RelatedItem[];
  keywords: string[];
  scanned: number;
  candidateLimit: number;
  limited: boolean;
  method: string;
};

interface RelatedNewsPanelProps {
  ticketId: string;
  sources: TicketSource[];
}

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

function urlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function displayDate(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function RelatedNewsPanel({
  ticketId,
  sources,
}: RelatedNewsPanelProps) {
  const cache = useQueryClient();

  const [query, setQuery] = useState("");

  const [sourceNotes, setSourceNotes] = useState<
    Record<string, string>
  >({});

  const [result, setResult] =
    useState<RelatedResponse | null>(null);

  const [loading, setLoading] = useState(false);

  const [addingId, setAddingId] =
    useState<string | null>(null);

  const [addedUrls, setAddedUrls] =
    useState<ReadonlySet<string>>(
      () => new Set(),
    );

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const busy = loading || addingId !== null;

  const existingUrls = new Set(
    sources.flatMap((source) =>
      source.url ? [urlKey(source.url)] : [],
    ),
  );

  function alreadyAdded(item: RelatedItem): boolean {
    const key = urlKey(item.url);

    return (
      existingUrls.has(key) ||
      addedUrls.has(key)
    );
  }

  async function search(): Promise<void> {
    if (busy) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setResult(null);

    try {
      const params = new URLSearchParams();

      if (query.trim() !== "") {
        params.set("q", query.trim());
      }

      const suffix = params.toString();

      const response = await apiFetch(
        `/tickets/${ticketId}/related-news${
          suffix ? `?${suffix}` : ""
        }`,
      );

      const data =
        (await response.json()) as RelatedResponse;

      setResult(data);

      setSourceNotes((current) => {
        const next = { ...current };

        for (const item of data.items) {
          // Keep notes already edited by the analyst.
          if (next[item.id] === undefined) {
            next[item.id] = item.summary ?? "";
          }
        }

        return next;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load related news.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function addSource(
    item: RelatedItem,
  ): Promise<void> {
    if (busy || alreadyAdded(item)) {
      return;
    }

    setAddingId(item.id);
    setError("");
    setMessage("");

    try {
      const notes = (
        sourceNotes[item.id] ??
        item.summary ??
        ""
      ).trim();

      await addTicketSource(ticketId, {
        url: item.url,
        title: item.title,
        ...(notes !== "" ? { notes } : {}),
      });

      setAddedUrls(
        (current) =>
          new Set([
            ...current,
            urlKey(item.url),
          ]),
      );

      setMessage(
        `"${item.title}" added as a source${
          notes !== ""
            ? " with supporting notes"
            : ""
        }. Select it under Sources before generating a draft.`,
      );

      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["ticket", ticketId],
        }),
        cache.invalidateQueries({
          queryKey: [
            "ticket-activity",
            ticketId,
          ],
        }),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add this source.",
      );
    } finally {
      setAddingId(null);
    }
  }

  return (
    <section
      aria-label="Related news"
      className="mt-5 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">
        Related news
      </h3>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        Find candidates using CVEs, product names,
        title keywords, and content already stored
        in feeds. Review each candidate before adding
        it. No AI key is required.
      </p>

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="text-xs text-slate-500">
            Search terms — optional
          </span>

          <input
            aria-label="Related news search terms"
            type="search"
            maxLength={200}
            value={query}
            disabled={busy}
            onChange={(event) => {
              setQuery(event.target.value);
              setResult(null);
              setError("");
              setMessage("");
            }}
            placeholder="Leave blank to use this ticket, or enter a CVE/vendor name"
            className={`${inputClass} mt-1`}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className={buttonClass}
        >
          {loading
            ? "Finding…"
            : "Find related news"}
        </button>
      </form>

      {error !== "" ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}

      {message !== "" ? (
        <p
          role="status"
          className="mt-3 text-sm text-emerald-700"
        >
          {message}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4">
          <p
            role="status"
            className="text-xs text-slate-500"
          >
            {result.items.length} candidates ·{" "}
            {result.scanned} stored feed items examined
          </p>

          {result.keywords.length > 0 ? (
            <p className="mt-1 break-words text-xs text-slate-500">
              Matched against:{" "}
              {result.keywords.join(", ")}
            </p>
          ) : null}

          {result.limited ? (
            <p className="mt-2 text-xs text-amber-600">
              Only the latest {result.candidateLimit}{" "}
              feed items with a URL were examined.
              Older feed items may also be relevant.
            </p>
          ) : null}

          {result.items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No new candidates found. Try a specific
              CVE, product, or vendor name. Existing
              source/reference URLs are excluded.
            </p>
          ) : (
            <ul className="mt-3 max-h-[36rem] space-y-3 overflow-y-auto">
              {result.items.map((item) => {
                const added =
                  alreadyAdded(item);

                const date = displayDate(
                  item.publishedAt,
                );

                return (
                  <li
                    key={item.id}
                    className="rounded-md border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-words text-sm font-medium text-indigo-600 hover:underline"
                        >
                          {item.title}
                        </a>

                        <p className="mt-1 break-all text-xs text-slate-500">
                          {item.url}
                        </p>

                        {date !== "" ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Published {date}
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        disabled={busy || added}
                        onClick={() =>
                          void addSource(item)
                        }
                        className={secondaryClass}
                      >
                        {addingId === item.id
                          ? "Adding…"
                          : added
                            ? "Added"
                            : "Add as source"}
                      </button>
                    </div>

                    <ul className="mt-2 space-y-1">
                      {item.reasons.map((reason) => (
                        <li
                          key={reason}
                          className="text-xs text-slate-500"
                        >
                          {reason}
                        </li>
                      ))}
                    </ul>

                    <label className="mt-3 block">
                      <span className="text-xs font-medium text-slate-700">
                        Supporting notes
                      </span>

                      <textarea
                        aria-label={`Supporting notes for ${item.title}`}
                        rows={4}
                        maxLength={5000}
                        disabled={busy || added}
                        value={
                          sourceNotes[item.id] ??
                          item.summary ??
                          ""
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value;

                          setSourceNotes(
                            (current) => ({
                              ...current,
                              [item.id]: value,
                            }),
                          );
                        }}
                        placeholder="Paste relevant evidence from this article."
                        className={`${inputClass} mt-1 resize-y`}
                      />

                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {added
                          ? "Source added. Edit notes in the source editor."
                          : item.summary
                            ? "Prefilled from the stored feed excerpt. Review or edit it before adding. This may not be the complete article."
                            : "No readable content was stored for this feed item. Paste factual notes before adding if the provider cannot read its URL."}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Adding saves title, URL, and reviewed notes.
            Select the new source, generate with
            References enabled, then review and apply
            the draft. No live article fetching or
            internet search is performed here.
          </p>
        </div>
      ) : null}
    </section>
  );
}