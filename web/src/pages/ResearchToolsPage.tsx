import { useState } from "react";
import { AutomaticRecapPanel } from "../components/AutomaticRecapPanel";
import { apiFetch } from "../lib/api";

type Story = {
  id: string;
  title: string;
  overview: string | null;
  summary: string;
  references: string[];
  status: string;
};

type Indicator = {
  id: string;
  type: string;
  value: string;
  context: string | null;
  createdAt: string;
  ticket: {
    title: string;
  };
};

type PageResponse<T> = {
  items: T[];
  total: number;
  unique?: number;
};

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

const cardClass =
  "min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm";

function download(
  filename: string,
  content: string,
  contentType: string,
): void {
  const blob = new Blob([content], {
    type: contentType,
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function csvCell(value: string): string {
  const safe = /^\s*[=+@\-\t\r]/.test(value)
    ? `'${value}`
    : value;

  return `"${safe.replaceAll('"', '""')}"`;
}

function readableMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(
    new Date(`${value}-01T00:00:00Z`),
  );
}

async function loadAllPages<T>(
  endpoint: string,
  from: string,
  to: string,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const params = new URLSearchParams({
      from,
      to,
      page: String(page),
    });

    const response = await apiFetch(
      `${endpoint}?${params.toString()}`,
    );

    const data =
      (await response.json()) as PageResponse<T>;

    if (
      !Array.isArray(data.items) ||
      !Number.isFinite(data.total) ||
      data.total < 0
    ) {
      throw new Error(
        "The server returned invalid data.",
      );
    }

    items.push(...data.items);
    total = data.total;

    if (
      data.items.length === 0 &&
      items.length < total
    ) {
      throw new Error(
        "Data changed while loading. Please load again.",
      );
    }

    page++;

    if (
      page > 10000 &&
      items.length < total
    ) {
      throw new Error(
        "Too many pages. Please use a smaller period.",
      );
    }
  } while (items.length < total);

  return items;
}

export function ResearchToolsPage() {
  const today = new Date();

  const [month, setMonth] = useState(
    `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}`,
  );

  const [year, setYear] = useState(
    String(today.getFullYear()),
  );

  const [stories, setStories] = useState<Story[]>([]);
  const [iocs, setIocs] = useState<Indicator[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);

  const [storySearch, setStorySearch] = useState("");
  const [iocSearch, setIocSearch] = useState("");
  const [iocType, setIocType] = useState("ALL");

  const [loadedMonth, setLoadedMonth] = useState("");
  const [loadedYear, setLoadedYear] = useState("");

  const [loading, setLoading] = useState<
    "recap" | "iocs" | null
  >(null);

  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copying, setCopying] = useState(false);

  const busy = loading !== null;

  const validMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    Number(month.slice(0, 4)) >= 2000 &&
    Number(month.slice(0, 4)) <= 9998;

  const validYear =
    /^\d{4}$/.test(year) &&
    Number(year) >= 2000 &&
    Number(year) <= 9998;

  const selectedStories = chosen.flatMap((id) => {
    const story = stories.find(
      (item) => item.id === id,
    );

    return story ? [story] : [];
  });

  const filteredStories = stories.filter((story) =>
    [
      story.title,
      story.overview ?? "",
      story.summary,
      story.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(storySearch.trim().toLowerCase()),
  );

  const filteredIocs = iocs.filter((ioc) => {
    const matchesType =
      iocType === "ALL" || ioc.type === iocType;

    const matchesSearch = [
      ioc.value,
      ioc.context ?? "",
      ioc.ticket.title,
    ]
      .join(" ")
      .toLowerCase()
      .includes(iocSearch.trim().toLowerCase());

    return matchesType && matchesSearch;
  });

  const uniqueIocs = new Set(
    iocs.map((ioc) => `${ioc.type}:${ioc.value}`),
  ).size;

  const filteredUniqueIocs = new Set(
    filteredIocs.map(
      (ioc) => `${ioc.type}:${ioc.value}`,
    ),
  ).size;

  const availableTypes = [
    ...new Set(iocs.map((ioc) => ioc.type)),
  ].sort();

  const recap = [
    `SecNews Recap — ${readableMonth(loadedMonth)}`,
    `Editorial selection: ${selectedStories.length} stories.`,
    "",
    ...selectedStories.map((story, index) => {
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
        story.overview?.trim() ||
          story.summary?.trim() ||
          "No overview available.",
        ...(references.length > 0
          ? ["", "References:", ...references]
          : []),
        "",
      ].join("\n");
    }),
  ].join("\n");

  async function loadStories(): Promise<void> {
    if (busy || copying || !validMonth) return;

    const requestedMonth = month;

    setLoading("recap");
    setError("");
    setCopyMessage("");
    setStories([]);
    setChosen([]);
    setLoadedMonth("");
    setStorySearch("");

    try {
      const [yearPart, monthPart] =
        requestedMonth.split("-");

      const lastDay = new Date(
        Date.UTC(
          Number(yearPart),
          Number(monthPart),
          0,
        ),
      ).getUTCDate();

      const rows = await loadAllPages<Story>(
        "/tools/recap",
        `${requestedMonth}-01`,
        `${requestedMonth}-${String(
          lastDay,
        ).padStart(2, "0")}`,
      );

      const distinct = new Map(
        rows.map((story) => [story.id, story]),
      );

      setStories([...distinct.values()]);
      setLoadedMonth(requestedMonth);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load stories.",
      );
    } finally {
      setLoading(null);
    }
  }

  async function loadIocs(): Promise<void> {
    if (busy || !validYear) return;

    const requestedYear = year;

    setLoading("iocs");
    setError("");
    setIocs([]);
    setLoadedYear("");
    setIocSearch("");
    setIocType("ALL");

    try {
      const rows =
        await loadAllPages<Indicator>(
          "/tools/iocs",
          `${requestedYear}-01-01`,
          `${requestedYear}-12-31`,
        );

      const distinct = new Map(
        rows.map((ioc) => [ioc.id, ioc]),
      );

      setIocs([...distinct.values()]);
      setLoadedYear(requestedYear);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load indicators.",
      );
    } finally {
      setLoading(null);
    }
  }

  function toggleStory(id: string): void {
    setCopyMessage("");

    setChosen((current) => {
      if (current.includes(id)) {
        return current.filter(
          (item) => item !== id,
        );
      }

      return current.length < 5
        ? [...current, id]
        : current;
    });
  }

  function moveStory(
    index: number,
    direction: -1 | 1,
  ): void {
    setCopyMessage("");

    setChosen((current) => {
      const destination = index + direction;

      if (
        index < 0 ||
        index >= current.length ||
        destination < 0 ||
        destination >= current.length
      ) {
        return current;
      }

      const next = [...current];
      const moved = next.splice(index, 1)[0];

      if (moved === undefined) return current;

      next.splice(destination, 0, moved);

      return next;
    });
  }

  async function copyRecap(): Promise<void> {
    if (
      selectedStories.length !== 5 ||
      copying
    ) {
      return;
    }

    setCopying(true);
    setCopyMessage("");

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable.");
      }

      await navigator.clipboard.writeText(recap);
      setCopyMessage("Recap copied.");
    } catch {
      setCopyMessage(
        "Could not copy automatically. Download TXT or select and copy the preview.",
      );
    } finally {
      setCopying(false);
    }
  }

  function exportIocs(): void {
    if (
      !loadedYear ||
      filteredIocs.length === 0
    ) {
      return;
    }

    const rows = [
      [
        "Type",
        "Value",
        "Context",
        "Ticket title",
        "Created at",
      ],
      ...filteredIocs.map((ioc) => [
        ioc.type,
        ioc.value,
        ioc.context ?? "",
        ioc.ticket.title,
        ioc.createdAt,
      ]),
    ];

    const csv =
      "\ufeff" +
      rows
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");

    download(
      `ioc-library-${loadedYear}-${iocType.toLowerCase()}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Recap & IOC library
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Generate monthly selections, prepare recaps,
          and review recorded indicators.
        </p>
      </div>

      <AutomaticRecapPanel />

      {error !== "" ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-slate-900">
          Manual monthly recap
        </h2>

        <p className="mt-1 text-sm leading-6 text-slate-500">
          Choose five stories and arrange their priority.
          The month uses ticket creation dates in UTC.
          No AI key is required.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">
              Month
            </span>

            <input
              aria-label="Recap month"
              type="month"
              min="2000-01"
              max="9998-12"
              value={month}
              disabled={busy || copying}
              className={inputClass}
              onChange={(event) => {
                setMonth(event.target.value);
                setStories([]);
                setChosen([]);
                setLoadedMonth("");
                setStorySearch("");
                setCopyMessage("");
              }}
            />
          </label>

          <button
            type="button"
            className={buttonClass}
            disabled={
              busy || copying || !validMonth
            }
            onClick={() => void loadStories()}
          >
            {loading === "recap"
              ? "Loading…"
              : "Load stories"}
          </button>
        </div>

        {loadedMonth !== "" ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p
                role="status"
                className="text-sm text-slate-600"
              >
                {stories.length} stories ·{" "}
                {chosen.length}/5 selected
              </p>

              <input
                aria-label="Search recap stories"
                type="search"
                placeholder="Search title or overview…"
                value={storySearch}
                onChange={(event) =>
                  setStorySearch(event.target.value)
                }
                className={`${inputClass} w-full sm:w-72`}
              />
            </div>

            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {filteredStories.map((story) => {
                const selected =
                  chosen.includes(story.id);

                return (
                  <li
                    key={story.id}
                    className="py-3"
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${story.title}`}
                        checked={selected}
                        disabled={
                          busy ||
                          copying ||
                          (!selected &&
                            chosen.length >= 5)
                        }
                        onChange={() =>
                          toggleStory(story.id)
                        }
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />

                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium text-slate-900">
                          {story.title}
                        </span>

                        <span className="mt-1 block text-xs text-slate-500">
                          {story.status}
                          {selected
                            ? ` · Priority ${
                                chosen.indexOf(
                                  story.id,
                                ) + 1
                              }`
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {filteredStories.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">
                {stories.length === 0
                  ? "No tickets found for this month."
                  : "No stories match your search."}
              </p>
            ) : null}

            {selectedStories.length > 0 ? (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Selected stories
                </h3>

                <ol className="mt-3 space-y-2">
                  {selectedStories.map(
                    (story, index) => (
                      <li
                        key={story.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-3"
                      >
                        <span className="text-sm font-semibold text-indigo-600">
                          {index + 1}.
                        </span>

                        <span className="min-w-0 flex-1 break-words text-sm text-slate-900">
                          {story.title}
                        </span>

                        <button
                          type="button"
                          aria-label={`Move ${story.title} up`}
                          className={secondaryClass}
                          disabled={
                            busy ||
                            copying ||
                            index === 0
                          }
                          onClick={() =>
                            moveStory(index, -1)
                          }
                        >
                          Up
                        </button>

                        <button
                          type="button"
                          aria-label={`Move ${story.title} down`}
                          className={secondaryClass}
                          disabled={
                            busy ||
                            copying ||
                            index ===
                              selectedStories.length -
                                1
                          }
                          onClick={() =>
                            moveStory(index, 1)
                          }
                        >
                          Down
                        </button>

                        <button
                          type="button"
                          aria-label={`Remove ${story.title}`}
                          className={secondaryClass}
                          disabled={busy || copying}
                          onClick={() =>
                            toggleStory(story.id)
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ),
                  )}
                </ol>

                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">
                  Recap preview
                </h3>

                <textarea
                  aria-label="Recap preview"
                  readOnly
                  rows={16}
                  value={recap}
                  className={`${inputClass} w-full resize-y leading-6`}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={
                  busy ||
                  copying ||
                  selectedStories.length !== 5
                }
                onClick={() => void copyRecap()}
              >
                {copying
                  ? "Copying…"
                  : "Copy recap"}
              </button>

              <button
                type="button"
                className={secondaryClass}
                disabled={
                  busy ||
                  selectedStories.length !== 5
                }
                onClick={() =>
                  download(
                    `secnews-recap-${loadedMonth}.txt`,
                    recap,
                    "text/plain;charset=utf-8",
                  )
                }
              >
                Download TXT
              </button>

              <button
                type="button"
                className={secondaryClass}
                disabled={
                  busy ||
                  copying ||
                  chosen.length === 0
                }
                onClick={() => {
                  setChosen([]);
                  setCopyMessage("");
                }}
              >
                Clear selection
              </button>
            </div>

            {copyMessage !== "" ? (
              <p
                role="status"
                className="mt-2 text-sm text-slate-600"
              >
                {copyMessage}
              </p>
            ) : null}

            {selectedStories.length !== 5 ? (
              <p className="mt-2 text-xs text-slate-500">
                Select exactly five stories to copy
                or download the manual recap.
              </p>
            ) : null}

            <p className="mt-2 text-xs text-slate-500">
              Selection is not saved after leaving
              or refreshing this page. Copy or
              download before leaving.
            </p>
          </>
        ) : null}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-slate-900">
          IOC library
        </h2>

        <p className="mt-1 text-sm leading-6 text-slate-500">
          Recorded indicators, not confirmed blocks.
          The year uses IOC creation dates in UTC.
          Unique indicators are counted by type
          and stored value.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">
              Year
            </span>

            <input
              aria-label="IOC year"
              type="number"
              min={2000}
              max={9998}
              value={year}
              disabled={busy}
              className={`${inputClass} w-32`}
              onChange={(event) => {
                setYear(event.target.value);
                setIocs([]);
                setLoadedYear("");
                setIocType("ALL");
                setIocSearch("");
              }}
            />
          </label>

          <button
            type="button"
            className={buttonClass}
            disabled={busy || !validYear}
            onClick={() => void loadIocs()}
          >
            {loading === "iocs"
              ? "Loading…"
              : "Load IOC library"}
          </button>
        </div>

        {loadedYear !== "" ? (
          <>
            <div
              role="status"
              className="my-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700"
            >
              <span>
                {iocs.length} total entries
              </span>

              <span>
                {uniqueIocs} unique indicators
              </span>

              <span>
                {filteredIocs.length} filtered entries
              </span>

              <span>
                {filteredUniqueIocs} filtered unique
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">
                  Type
                </span>

                <select
                  aria-label="Filter library IOC type"
                  className={inputClass}
                  value={iocType}
                  onChange={(event) =>
                    setIocType(event.target.value)
                  }
                >
                  <option value="ALL">
                    All types
                  </option>

                  {availableTypes.map((type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex w-full flex-col gap-1 sm:w-80">
                <span className="text-xs text-slate-500">
                  Search
                </span>

                <input
                  aria-label="Search IOC library"
                  type="search"
                  placeholder="Value, context, or ticket…"
                  className={inputClass}
                  value={iocSearch}
                  onChange={(event) =>
                    setIocSearch(event.target.value)
                  }
                />
              </label>

              <button
                type="button"
                className={`${buttonClass} self-end`}
                disabled={
                  busy ||
                  filteredIocs.length === 0
                }
                onClick={exportIocs}
              >
                Export {filteredIocs.length} entries
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              CSV includes all entries matching the
              current type and search filters,
              including repeated indicators recorded
              on different tickets.
            </p>

            <div className="mt-4 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    {[
                      "Type",
                      "Value",
                      "Context",
                      "Ticket",
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="p-2 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredIocs.map((ioc) => (
                    <tr
                      key={ioc.id}
                      className="border-b border-slate-100"
                    >
                      <td className="p-2 text-slate-700">
                        {ioc.type}
                      </td>

                      <td className="min-w-40 max-w-72 break-all p-2 font-mono text-slate-900">
                        {ioc.value}
                      </td>

                      <td className="min-w-48 whitespace-pre-wrap break-words p-2 text-slate-500">
                        {ioc.context ?? "—"}
                      </td>

                      <td className="min-w-40 break-words p-2 text-slate-600">
                        {ioc.ticket.title}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredIocs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No indicators match this year and filter.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}