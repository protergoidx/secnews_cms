import { useState } from "react";
import {
  IOC_TYPES,
  type IocType,
} from "../../lib/ticketsApi";
import { useAddIoc } from "../../lib/useTickets";

const MAX_BATCH_SIZE = 100;

export function BulkIocInput({
  ticketId,
}: {
  ticketId: string;
}) {
  const [type, setType] = useState<IocType>("DOMAIN");
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const addIoc = useAddIoc();

  const values = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    ),
  ];

  async function submit(): Promise<void> {
    if (
      busy ||
      values.length === 0 ||
      values.length > MAX_BATCH_SIZE
    ) {
      return;
    }

    setBusy(true);
    setFeedback("");

    const failedValues: string[] = [];
    const errors: string[] = [];
    let added = 0;

    try {
      for (const value of values) {
        try {
          await addIoc.mutateAsync({
            id: ticketId,
            body: {
              type,
              value,
              includeInBulletin: true,
              ...(context.trim() !== ""
                ? { context: context.trim() }
                : {}),
            },
          });

          added += 1;
        } catch (error) {
          failedValues.push(value);
          errors.push(
            `${value}: ${
              error instanceof Error
                ? error.message
                : "Failed to add IOC."
            }`,
          );
        }
      }

      setText(failedValues.join("\n"));

      setFeedback(
        [
          `${added} added; ${failedValues.length} failed.`,
          ...errors,
        ].join("\n"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">
        Bulk input IOC
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        Paste one indicator per line. All rows use the
        selected type. Maximum 100 unique rows per batch.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">
            Type
          </span>

          <select
            aria-label="Bulk IOC type"
            value={type}
            disabled={busy}
            onChange={(event) =>
              setType(event.target.value as IocType)
            }
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {IOC_TYPES.map((iocType) => (
              <option key={iocType} value={iocType}>
                {iocType}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-xs text-slate-500">
            Context for all rows (optional)
          </span>

          <input
            aria-label="Bulk IOC context"
            type="text"
            value={context}
            disabled={busy}
            onChange={(event) =>
              setContext(event.target.value)
            }
            placeholder="Example: suspected C2 infrastructure"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="mt-3 flex flex-col gap-1">
        <span className="text-xs text-slate-500">
          IOC values — one per line
        </span>

        <textarea
          aria-label="Bulk IOC values"
          rows={6}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
          placeholder={"first.example.com\nsecond.example.com"}
          className="w-full resize-y rounded-md border border-slate-200 bg-white p-3 font-mono text-sm focus:border-indigo-600 focus:outline-none"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={
            busy ||
            values.length === 0 ||
            values.length > MAX_BATCH_SIZE
          }
          onClick={() => void submit()}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Adding IOCs…"
            : `Add ${values.length} IOCs`}
        </button>

        <span className="text-xs text-slate-500">
          {values.length} unique rows
        </span>

        <button
          type="button"
          disabled={busy || text === ""}
          onClick={() => {
            setText("");
            setFeedback("");
          }}
          className="text-xs text-slate-500 underline disabled:opacity-50"
        >
          Clear input
        </button>
      </div>

      {values.length > MAX_BATCH_SIZE ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          Maximum 100 unique rows per batch.
        </p>
      ) : null}

      {feedback ? (
        <p
          role="status"
          className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}