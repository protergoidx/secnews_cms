import { useState } from "react";
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

type PeriodResponse = {
  items: (Story | Indicator)[];
  total: number;
  unique?: number;
};

function download(
  name: string,
  content: string,
  contentType: string,
): void {
  const blob = new Blob([content], {
    type: contentType,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string): string {
  const safe = /^[=+@\-\t\r]/.test(value)
    ? `'${value}`
    : value;

  return `"${safe.replaceAll('"', '""')}"`;
}

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none";

export function ResearchToolsPage() {
  const today = new Date();

  const [month, setMonth] = useState(
    `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}`,
  );
  const [year, setYear] = useState(today.getFullYear());

  const [stories, setStories] = useState<Story[]>([]);
  const [iocs, setIocs] = useState<Indicator[]>([]);
  const [unique, setUnique] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);

  const [loading, setLoading] = useState<
    "recap" | "iocs" | null
  >(null);
  const [error, setError] = useState("");

  const [loadedMonth, setLoadedMonth] = useState("");
  const [loadedYear, setLoadedYear] = useState<
    number | null
  >(null);

  const busy = loading !== null;

  const recap = [
    `SecNews Recap — ${loadedMonth}`,
    "Editorial selection: five stories in selected priority order.",
    "",
    ...chosen.map((id, index) => {
      const story = stories.find(
        (item) => item.id === id,
      );

      if (story === undefined) {
        return "";
      }

      const description =
        story.overview?.trim() || story.summary;

      return [
        `${index + 1}. ${story.title}`,
        description,
        ...story.references,
        "",
      ].join("\n");
    }),
  ].join("\n");

  async function load(
    mode: "recap" | "iocs",
  ): Promise<void> {
    setLoading(mode);
    setError("");

    if (mode === "recap") {
      setStories([]);
      setChosen([]);
      setLoadedMonth("");
    } else {
      setIocs([]);
      setUnique(0);
      setLoadedYear(null);
    }

    try {
      const from =
        mode === "recap"
          ? `${month}-01`
          : `${year}-01-01`;

      const lastDay = new Date(
        Date.UTC(
          Number(month.slice(0, 4)),
          Number(month.slice(5, 7)),
          0,
        ),
      ).getUTCDate();

      const to =
        mode === "recap"
          ? `${month}-${String(lastDay).padStart(2, "0")}`
          : `${year}-12-31`;

      const rows: (Story | Indicator)[] = [];
      let page = 1;
      let total = 0;
      let countUnique = 0;

      do {
        const params = new URLSearchParams({
          from,
          to,
          page: String(page),
        });

        const response = await apiFetch(
          `/tools/${mode}?${params.toString()}`,
        );

        const data =
          (await response.json()) as PeriodResponse;

        rows.push(...data.items);
        total = data.total;
        countUnique = data.unique ?? 0;
        page += 1;

        if (
          data.items.length === 0 &&
          rows.length < total
        ) {
          throw new Error(
            "Data changed while loading. Please reload.",
          );
        }
      } while (rows.length < total);

      if (mode === "recap") {
        setStories(rows as Story[]);
        setLoadedMonth(month);
      } else {
        setIocs(rows as Indicator[]);
        setUnique(countUnique);
        setLoadedYear(year);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load data.",
      );
    } finally {
      setLoading(null);
    }
  }

  function exportIocs(): void {
    const rows = [
      [
        "Type",
        "Value",
        "Context",
        "Ticket title",
        "Created at",
      ],
      ...iocs.map((ioc) => [
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
      `ioc-library-${loadedYear}.csv`,
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
          Prepare monthly recaps and explore recorded
          indicators.
        </p>
      </div>

      {error !== "" ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Monthly SecNews recap
        </h2>

        <p className="my-2 text-sm text-slate-600">
          Choose five stories in priority order. The
          period uses ticket creation dates in UTC.
          Review the draft before sharing.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">
              Month
            </span>
            <input
              aria-label="Recap month"
              type="month"
              value={month}
              disabled={busy}
              className={inputClass}
              onChange={(event) => {
                setMonth(event.target.value);
                setLoadedMonth("");
                setStories([]);
                setChosen([]);
              }}
            />
          </label>

          <button
            type="button"
            className={buttonClass}
            disabled={busy || month === ""}
            onClick={() => void load("recap")}
          >
            {loading === "recap"
              ? "Loading…"
              : "Load stories"}
          </button>
        </div>

        {loadedMonth !== "" ? (
          <p
            aria-live="polite"
            className="my-3 text-sm text-slate-600"
          >
            {stories.length} stories · {chosen.length}/5
            selected
          </p>
        ) : null}

        <ul className="my-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {stories.map((story) => {
            const selected = chosen.includes(story.id);

            return (
              <li key={story.id} className="py-3">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    className="mt-1"
                    disabled={
                      busy ||
                      (!selected && chosen.length >= 5)
                    }
                    onChange={(event) => {
                      const checked =
                        event.target.checked;

                      setChosen((current) =>
                        checked
                          ? current.includes(story.id) ||
                            current.length >= 5
                            ? current
                            : [...current, story.id]
                          : current.filter(
                              (id) => id !== story.id,
                            ),
                      );
                    }}
                  />

                  <span className="min-w-0 break-words text-slate-900">
                    {story.title}
                    <span className="ml-2 text-xs text-slate-500">
                      {story.status}
                    </span>

                    {selected ? (
                      <span className="ml-2 text-xs font-semibold text-indigo-600">
                        #{chosen.indexOf(story.id) + 1}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {chosen.length > 0 ? (
          <pre className="mb-3 whitespace-pre-wrap break-words rounded-md bg-slate-50 p-4 text-sm text-slate-700">
            {recap}
          </pre>
        ) : null}

        <button
          type="button"
          className={buttonClass}
          disabled={chosen.length !== 5 || busy}
          onClick={() =>
            download(
              `secnews-recap-${loadedMonth}.txt`,
              recap,
              "text/plain;charset=utf-8",
            )
          }
        >
          Download five-story recap
        </button>

        {loadedMonth !== "" && stories.length < 5 ? (
          <p className="mt-2 text-sm text-slate-500">
            Fewer than five stories are available in
            this month. Choose another month or add
            more stories.
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          IOC library
        </h2>

        <p className="my-2 text-sm text-slate-600">
          Recorded indicators, not confirmed blocks.
          The period uses IOC creation dates in UTC.
          Unique indicators are counted by type and
          value.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">
              Year
            </span>
            <input
              aria-label="IOC year"
              type="number"
              min={2000}
              max={9998}
              disabled={busy}
              value={year}
              className={`${inputClass} w-32`}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setIocs([]);
                setUnique(0);
                setLoadedYear(null);
              }}
            />
          </label>

          <button
            type="button"
            className={buttonClass}
            disabled={
              busy ||
              year < 2000 ||
              year > 9998 ||
              !Number.isInteger(year)
            }
            onClick={() => void load("iocs")}
          >
            {loading === "iocs"
              ? "Loading…"
              : "Load IOC library"}
          </button>
        </div>

        {loadedYear !== null ? (
          <>
            <p
              aria-live="polite"
              className="my-3 text-sm text-slate-700"
            >
              {iocs.length} entries · {unique} unique
              indicators
            </p>

            <button
              type="button"
              className={buttonClass}
              disabled={busy || iocs.length === 0}
              onClick={exportIocs}
            >
              Export all loaded IOCs
            </button>

            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th scope="col" className="p-2">
                      Type
                    </th>
                    <th scope="col" className="p-2">
                      Value
                    </th>
                    <th scope="col" className="p-2">
                      Ticket
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {iocs.map((ioc) => (
                    <tr
                      className="border-b border-slate-100"
                      key={ioc.id}
                    >
                      <td className="p-2 text-slate-700">
                        {ioc.type}
                      </td>
                      <td className="break-all p-2 font-mono text-slate-900">
                        {ioc.value}
                      </td>
                      <td className="p-2 text-slate-600">
                        {ioc.ticket.title}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {iocs.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No indicators found for this year.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}