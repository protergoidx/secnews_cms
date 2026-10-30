import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import type { IocType } from "../../lib/ticketsApi";

type Document = { filename: string; text: string };
type Evidence = { filename: string; context: string; occurrences: number };
type Row = {
  type: IocType;
  value: string;
  context: string;
  filename: string;
  occurrences: number;
  exists: boolean;
  contextTruncated?: boolean;
  evidence?: Evidence[];
};
const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50";
const secondaryClass =
  "rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50";
const fieldClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:opacity-50";
const rowKey = (row: Row): string => `${row.type}:${row.value}`;

export function IocTextImport({ ticketId }: { ticketId: string }) {
  const cache = useQueryClient();
  const [mode, setMode] = useState<"FILES" | "TEXT">("FILES");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const visible = rows.filter((row) => filter === "ALL" || row.type === filter);
  const selectable = visible.filter((row) => !row.exists);
  const chosen = rows.filter((row) => !row.exists && selected.has(rowKey(row)));

  function clearPreview(): void {
    setRows([]);
    setSelected(new Set());
    setFilter("ALL");
    setError("");
    setMessage("");
  }

  async function readFiles(files: File[]): Promise<void> {
    if (busy) return;
    clearPreview();
    setDocuments([]);
    setFileErrors([]);
    if (files.length > 100) {
      setError("Select no more than 100 TXT files per batch.");
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > 1000000) {
      setError("Total selected file size must not exceed 1 MB.");
      return;
    }
    setBusy(true);
    const loaded: Document[] = [];
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (!/\.txt$/i.test(file.name) || file.size > 200000) {
          errors.push(`${file.name}: use a .txt file up to 200 KB.`);
          continue;
        }
        try {
          const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
          if (!value.trim()) {
            errors.push(`${file.name}: empty text.`);
            continue;
          }
          loaded.push({ filename: file.name, text: value });
        } catch {
          errors.push(`${file.name}: could not read UTF-8 text.`);
        }
      }
      setDocuments(loaded);
      setFileErrors(errors);
      setMessage(`${loaded.length} file(s) ready. Review any skipped files, then preview.`);
    } finally {
      setBusy(false);
    }
  }

  async function preview(source: "ticket" | "input"): Promise<void> {
    if (busy) return;
    clearPreview();
    setBusy(true);
    try {
      const batch = source === "input" && mode === "FILES";
      const path = batch ? "text-batch-preview" : "text-preview";
      const body =
        source === "ticket"
          ? { mode: "ticket" }
          : batch
            ? { documents }
            : { mode: "text", text, filename: "Pasted message" };
      const response = await apiFetch(`/tickets/${ticketId}/iocs/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { rows: Row[]; filesProcessed?: number };
      setRows(data.rows);
      setSelected(new Set(data.rows.filter((row) => !row.exists).map(rowKey)));
      setMessage(
        data.rows.length
          ? `${data.rows.length} unique candidates found${data.filesProcessed ? ` from ${data.filesProcessed} files` : ""}. Review before adding.`
          : "No IOC candidates found. Reference-section links are excluded.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (busy || !chosen.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(`/tickets/${ticketId}/iocs/text-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: chosen.map(({ type, value, context }) => ({ type, value, context })),
        }),
      });
      const data = (await response.json()) as { added: number; skipped: number };
      const saved = new Set(chosen.map(rowKey));
      setRows((current) =>
        current.map((row) => (saved.has(rowKey(row)) ? { ...row, exists: true } : row)),
      );
      setSelected(new Set());
      setMessage(`${data.added} IOCs added; ${data.skipped} duplicates skipped.`);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["ticket", ticketId] }),
        cache.invalidateQueries({ queryKey: ["ticket-activity", ticketId] }),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Extract IOCs</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Extract from saved ticket fields, pasted text, or multiple TXT files. Preview and edit
        contexts before saving. Manual Add IOC remains available above.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void preview("ticket")}
        className={`${secondaryClass} mt-3`}
      >
        Extract from this ticket
      </button>
      <p className="mt-1 text-xs text-slate-500">
        Save Overview/Description first. No file download is needed.
      </p>
      <div className="mt-4 flex gap-2">
        {(["FILES", "TEXT"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            disabled={busy}
            onClick={() => {
              setMode(item);
              clearPreview();
            }}
            className={mode === item ? buttonClass : secondaryClass}
          >
            {item === "FILES" ? "TXT files" : "Paste message"}
          </button>
        ))}
      </div>
      {mode === "FILES" ? (
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-700">
            Select TXT files
            <input
              aria-label="Upload IOC TXT files"
              type="file"
              multiple
              accept=".txt,text/plain"
              disabled={busy}
              className="mt-2 block max-w-full text-sm"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void readFiles(files);
              }}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            UTF-8 only. Maximum 100 files, 200 KB per file, 1 MB total, and 1,000 unique IOCs per
            preview.
          </p>
          {documents.length ? (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer">{documents.length} files ready</summary>
              <ul className="mt-1 max-h-32 overflow-auto">
                {documents.map((document, index) => (
                  <li key={`${index}:${document.filename}`}>{document.filename}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {fileErrors.length ? (
            <div role="alert" className="mt-2 text-xs text-amber-600">
              <p>These files were skipped. They will not be included:</p>
              <ul className="mt-1 max-h-32 overflow-auto">
                {fileErrors.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <label className="mt-3 block text-xs font-medium text-slate-700">
          WhatsApp / email text
          <textarea
            aria-label="Message containing IOCs"
            rows={7}
            maxLength={200000}
            disabled={busy}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              clearPreview();
            }}
            placeholder={
              "Indicators of Compromise\nDomain\nlogin-check[.]example[.]com\nContext: Training indicator."
            }
            className={`${fieldClass} mt-2 resize-y`}
          />
        </label>
      )}
      <button
        type="button"
        disabled={busy || (mode === "FILES" ? !documents.length : !text.trim())}
        onClick={() => void preview("input")}
        className={`${buttonClass} mt-3`}
      >
        Preview extracted IOCs
      </button>
      {busy ? (
        <p role="status" className="mt-2 text-sm text-slate-500">
          Processing…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-sm text-slate-700">
          {message}
        </p>
      ) : null}
      {rows.length ? (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <label>
              Filter type{" "}
              <select
                aria-label="Filter extracted IOC type"
                disabled={busy}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="ml-2 rounded-md border border-slate-200 bg-white p-2"
              >
                {["ALL", ...new Set(rows.map((row) => row.type))].map((type) => (
                  <option key={type} value={type}>
                    {type === "ALL" ? "All types" : type}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={busy || !selectable.length}
                checked={
                  selectable.length > 0 && selectable.every((row) => selected.has(rowKey(row)))
                }
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((current) => {
                    const next = new Set(current);
                    for (const row of selectable) {
                      if (checked) next.add(rowKey(row));
                      else next.delete(rowKey(row));
                    }
                    return next;
                  });
                }}
              />
              Select filtered rows
            </label>
            <span>{chosen.length} selected across all types</span>
          </div>
          <div className="mt-3 max-h-[32rem] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  {["Select", "Type", "Value", "Context", "Sources / status"].map((label) => (
                    <th key={label} scope="col" className="p-2 font-medium text-slate-500">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={rowKey(row)} className="border-t border-slate-200">
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Import ${row.value}`}
                        disabled={busy || row.exists}
                        checked={!row.exists && selected.has(rowKey(row))}
                        onChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(rowKey(row))) next.delete(rowKey(row));
                            else next.add(rowKey(row));
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-2 align-top text-slate-700">{row.type}</td>
                    <td className="min-w-40 max-w-64 break-all p-2 align-top font-mono text-slate-900">
                      {row.value}
                    </td>
                    <td className="min-w-64 p-2 align-top">
                      <textarea
                        aria-label={`Context for ${row.value}`}
                        rows={4}
                        maxLength={5000}
                        value={row.context}
                        disabled={busy || row.exists}
                        className={`${fieldClass} resize-y text-xs`}
                        onChange={(event) => {
                          const context = event.target.value;
                          setRows((current) =>
                            current.map((item) =>
                              rowKey(item) === rowKey(row) ? { ...item, context } : item,
                            ),
                          );
                        }}
                      />
                      {row.contextTruncated ? (
                        <p className="mt-1 text-amber-600">
                          Combined context was shortened to 5,000 characters. Review original
                          evidence and edit before adding.
                        </p>
                      ) : null}
                    </td>
                    <td className="min-w-40 max-w-64 break-words p-2 align-top text-slate-600">
                      <p>{row.exists ? "Already on ticket" : `${row.occurrences} occurrence(s)`}</p>
                      {row.evidence?.length ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer">
                            Source evidence ({row.evidence.length})
                          </summary>
                          {row.evidence.map((item, index) => (
                            <div key={index} className="mt-2 border-t border-slate-200 pt-2">
                              <p className="font-medium">{item.filename}</p>
                              <p className="mt-1 whitespace-pre-wrap">{item.context}</p>
                            </div>
                          ))}
                        </details>
                      ) : (
                        <p className="mt-1">{row.filename}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Repeated indicators are grouped across files. Existing ticket IOCs are not overwritten.
            Reference-section links are excluded. The Add button saves selected rows across all
            filters.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !chosen.length}
              onClick={() => void save()}
              className={buttonClass}
            >
              Add {chosen.length} selected IOCs to ticket
            </button>
            <button type="button" disabled={busy} onClick={clearPreview} className={secondaryClass}>
              Clear preview
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
