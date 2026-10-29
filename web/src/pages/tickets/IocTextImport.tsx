import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import type { IocType } from "../../lib/ticketsApi";

type PreviewRow = {
  type: IocType;
  value: string;
  context: string;
  filename: string;
  occurrences: number;
  exists: boolean;
};

type PreviewResponse = {
  rows: PreviewRow[];
};

type ImportResponse = {
  added: number;
  skipped: number;
};

interface IocTextImportProps {
  ticketId: string;
}

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

const fieldClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

function rowKey(row: PreviewRow): string {
  return `${row.type}:${row.value}`;
}

export function IocTextImport({
  ticketId,
}: IocTextImportProps) {
  const cache = useQueryClient();

  const [text, setText] = useState("");
  const [filename, setFilename] =
    useState("Pasted message");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selected, setSelected] =
    useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const availableTypes = [
    ...new Set(rows.map((row) => row.type)),
  ];

  const visibleRows = rows.filter(
    (row) => filter === "ALL" || row.type === filter,
  );

  const selectableVisibleRows = visibleRows.filter(
    (row) => !row.exists,
  );

  const selectedRows = rows.filter(
    (row) => !row.exists && selected.has(rowKey(row)),
  );

  const allVisibleSelected =
    selectableVisibleRows.length > 0 &&
    selectableVisibleRows.every((row) =>
      selected.has(rowKey(row)),
    );

  function clearPreview(): void {
    setRows([]);
    setSelected(new Set());
    setFilter("ALL");
    setMessage("");
    setError("");
  }

  function toggleRow(row: PreviewRow): void {
    setSelected((current) => {
      const next = new Set(current);
      const key = rowKey(row);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function toggleVisibleRows(checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);

      for (const row of selectableVisibleRows) {
        const key = rowKey(row);

        if (checked) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }

      return next;
    });
  }

  function updateContext(
    target: PreviewRow,
    context: string,
  ): void {
    const targetKey = rowKey(target);

    setRows((current) =>
      current.map((row) =>
        rowKey(row) === targetKey
          ? { ...row, context }
          : row,
      ),
    );
  }

  async function readFile(file: File): Promise<void> {
    clearPreview();
    setText("");
    setFilename("Pasted message");

    if (!/\.txt$/i.test(file.name)) {
      setError("Please choose a .txt file.");
      return;
    }

    if (file.size > 200000) {
      setError("Maximum TXT file size is 200 KB.");
      return;
    }

    setBusy(true);

    try {
      const buffer = await file.arrayBuffer();

      const contents = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(buffer);

      setText(contents);
      setFilename(file.name);

      setMessage(
        `${file.name} loaded. Click Preview extracted IOCs to continue.`,
      );
    } catch {
      setError(
        "Cannot read this file. Save it as UTF-8 text and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function preview(
    mode: "ticket" | "text",
  ): Promise<void> {
    if (busy) return;

    if (mode === "text" && text.trim() === "") {
      setError("Paste a message or upload a TXT file first.");
      return;
    }

    clearPreview();
    setBusy(true);

    try {
      const body =
        mode === "ticket"
          ? { mode: "ticket" }
          : {
              mode: "text",
              text,
              filename,
            };

      const response = await apiFetch(
        `/tickets/${ticketId}/iocs/text-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const data =
        (await response.json()) as PreviewResponse;

      setRows(data.rows);

      setSelected(
        new Set(
          data.rows
            .filter((row) => !row.exists)
            .map(rowKey),
        ),
      );

      setMessage(
        data.rows.length > 0
          ? `${data.rows.length} unique IOC candidates found. Review the type and context before adding.`
          : "No IOC candidates found. Links under References are excluded.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to extract IOCs.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected(): Promise<void> {
    if (busy || selectedRows.length === 0) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await apiFetch(
        `/tickets/${ticketId}/iocs/text-import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rows: selectedRows.map(
              ({ type, value, context }) => ({
                type,
                value,
                context,
              }),
            ),
          }),
        },
      );

      const result =
        (await response.json()) as ImportResponse;

      const savedKeys = new Set(
        selectedRows.map(rowKey),
      );

      setRows((current) =>
        current.map((row) =>
          savedKeys.has(rowKey(row))
            ? { ...row, exists: true }
            : row,
        ),
      );

      setSelected(new Set());

      setMessage(
        `${result.added} IOCs added to this ticket. ${result.skipped} duplicates skipped.`,
      );

      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["ticket", ticketId],
        }),
        cache.invalidateQueries({
          queryKey: ["ticket-activity", ticketId],
        }),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to add IOCs.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Extract IOCs"
      className="mt-5 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Extract IOCs
          </h3>

          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Detect indicators from saved ticket content,
            a WhatsApp/email message, or a TXT file.
            Review the results before adding them.
          </p>
        </div>

        <button
          type="button"
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void preview("ticket")}
        >
          Extract from this ticket
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Save changes to Overview/Description first.
        Extracting from this ticket does not download a file.
      </p>

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Upload TXT
          </span>

          <input
            type="file"
            accept=".txt,text/plain"
            aria-label="Upload IOC text file"
            disabled={busy}
            className="mt-2 block w-full text-sm text-slate-600"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void readFile(file);
              }

              event.target.value = "";
            }}
          />
        </label>

        <p className="mt-2 text-xs text-slate-500">
          UTF-8 text, maximum 200 KB.
        </p>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-medium text-slate-700">
          Or paste WhatsApp / email text
        </span>

        <textarea
          aria-label="Message containing IOCs"
          className={`${fieldClass} mt-2 min-h-40 resize-y`}
          rows={7}
          maxLength={200000}
          disabled={busy}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFilename("Pasted message");
            clearPreview();
          }}
          placeholder={
            "Indicators of Compromise\n\nDomain\nlogin-check[.]example[.]com\nContext: Simulated phishing domain from a training email.\n\nIPv4\n192[.]0[.]2[.]25\nContext: Simulated server from test logs."
          }
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={busy || text.trim() === ""}
          onClick={() => void preview("text")}
        >
          Preview extracted IOCs
        </button>

        {text.trim() !== "" ? (
          <span className="text-xs text-slate-500">
            Source: {filename}
          </span>
        ) : null}
      </div>

      {busy ? (
        <p
          role="status"
          className="mt-3 text-sm text-slate-500"
        >
          Processing…
        </p>
      ) : null}

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
          className="mt-3 text-sm text-slate-700"
        >
          {message}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              Filter type

              <select
                aria-label="Filter extracted IOC type"
                value={filter}
                disabled={busy}
                onChange={(event) =>
                  setFilter(event.target.value)
                }
                className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900"
              >
                <option value="ALL">
                  All types
                </option>

                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                disabled={
                  busy ||
                  selectableVisibleRows.length === 0
                }
                onChange={(event) =>
                  toggleVisibleRows(
                    event.target.checked,
                  )
                }
                className="h-4 w-4 accent-indigo-600"
              />

              Select filtered rows
            </label>

            <span className="text-xs text-slate-500">
              {selectedRows.length} selected across all types
            </span>
          </div>

          <div className="mt-3 max-h-96 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th
                    scope="col"
                    className="p-3 font-medium"
                  >
                    Select
                  </th>

                  <th
                    scope="col"
                    className="p-3 font-medium"
                  >
                    Type
                  </th>

                  <th
                    scope="col"
                    className="p-3 font-medium"
                  >
                    Value
                  </th>

                  <th
                    scope="col"
                    className="p-3 font-medium"
                  >
                    Context
                  </th>

                  <th
                    scope="col"
                    className="p-3 font-medium"
                  >
                    Source / status
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="border-t border-slate-200"
                  >
                    <td className="p-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Import ${row.value}`}
                        checked={
                          !row.exists &&
                          selected.has(rowKey(row))
                        }
                        disabled={busy || row.exists}
                        onChange={() => toggleRow(row)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                    </td>

                    <td className="whitespace-nowrap p-3 align-top text-slate-700">
                      {row.type}
                    </td>

                    <td className="min-w-40 max-w-64 break-all p-3 align-top font-mono text-slate-900">
                      {row.value}
                    </td>

                    <td className="min-w-64 p-3 align-top">
                      <textarea
                        aria-label={`Context for ${row.value}`}
                        rows={3}
                        maxLength={5000}
                        value={row.context}
                        disabled={busy || row.exists}
                        onChange={(event) =>
                          updateContext(
                            row,
                            event.target.value,
                          )
                        }
                        className={`${fieldClass} resize-y text-xs`}
                      />
                    </td>

                    <td className="min-w-36 p-3 align-top text-slate-700">
                      <span className="break-words">
                        {row.filename}
                      </span>

                      <p className="mt-1 text-slate-500">
                        {row.exists
                          ? "Already on ticket"
                          : `${row.occurrences} occurrence(s)`}
                      </p>
                    </td>
                  </tr>
                ))}

                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-4 text-center text-slate-500"
                    >
                      No indicators for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Context is copied from the source text and can
            be edited. Reference-section links are excluded.
            The Add button saves selected rows across all
            filters, including rows currently hidden.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={
                busy || selectedRows.length === 0
              }
              onClick={() => void saveSelected()}
            >
              Add {selectedRows.length} selected IOCs to ticket
            </button>

            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={clearPreview}
            >
              Clear preview
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}