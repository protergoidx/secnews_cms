import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Pagination } from "../../components/Pagination";
import { formatTimestamp } from "../../lib/datetime";
import type {
  AiSuggestion,
  SuggestionOrigin,
} from "../../lib/ticketsApi";
import {
  useAcceptSuggestion,
  useDeleteSuggestion,
  useRejectSuggestion,
  useSuggestions,
} from "../../lib/useTickets";

const PAGE_SIZES = [5, 10, 20] as const;
const PREVIEW_LIMIT = 160;

const BADGE_CLASSES: Record<
  AiSuggestion["status"],
  string
> = {
  PENDING: "bg-amber-100 text-amber-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-700",
};

function metaLine(suggestion: AiSuggestion): string {
  const provider = suggestion.provider ?? "Auto";
  const model = suggestion.model
    ? ` · ${suggestion.model}`
    : "";

  return `${formatTimestamp(suggestion.createdAt)} WIB · ${provider}${model}`;
}

function deleteMessage(suggestion: AiSuggestion): string {
  const note =
    suggestion.status === "ACCEPTED"
      ? "The merged field values remain on the ticket."
      : "This cannot be undone.";

  return `Delete this ${suggestion.status.toLowerCase()} ${suggestion.field} suggestion? ${note}`;
}

export function SuggestionList({
  ticketId,
  origin,
}: {
  ticketId: string;
  origin: SuggestionOrigin[];
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteTarget, setDeleteTarget] =
    useState<AiSuggestion | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");

  const query = useSuggestions(
    ticketId,
    undefined,
    page,
    pageSize,
    origin,
  );

  const accept = useAcceptSuggestion();
  const reject = useRejectSuggestion();
  const remove = useDeleteSuggestion();

  const suggestions = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pending = suggestions.filter(
    (item) => item.status === "PENDING",
  );
  const chosen = pending.filter(
    (item) => selected.has(item.id),
  );

  const conflictingFields =
    new Set(chosen.map((item) => item.field)).size !==
    chosen.length;

  const busy =
    bulkBusy ||
    accept.isPending ||
    reject.isPending ||
    remove.isPending;

  const disabled = busy || query.isPlaceholderData;

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFeedback("");
    setActionError("");
  }

  function toggleExpanded(id: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function review(
    action: "accept" | "reject",
    targets: AiSuggestion[],
  ): Promise<void> {
    if (disabled || targets.length === 0) return;

    if (
      action === "accept" &&
      new Set(targets.map((item) => item.field)).size !==
        targets.length
    ) {
      setActionError(
        "Choose only one suggestion per field before accepting.",
      );
      return;
    }

    setBulkBusy(true);
    setFeedback("");
    setActionError("");

    let completed = 0;
    const failures: string[] = [];

    try {
      for (const suggestion of targets) {
        try {
          const input = {
            id: ticketId,
            suggestionId: suggestion.id,
          };

          if (action === "accept") {
            await accept.mutateAsync(input);
          } else {
            await reject.mutateAsync(input);
          }

          completed += 1;
          setSelected((current) => {
            const next = new Set(current);
            next.delete(suggestion.id);
            return next;
          });
        } catch (error) {
          failures.push(
            `${suggestion.field}: ${
              error instanceof Error
                ? error.message
                : "Request failed."
            }`,
          );
        }
      }

      setFeedback(
        `${completed} ${
          action === "accept" ? "accepted" : "rejected"
        }; ${failures.length} failed.`,
      );
      setActionError(failures.join("\n"));
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSuggestion(
    suggestion: AiSuggestion,
  ): Promise<void> {
    setActionError("");
    setFeedback("");

    try {
      await remove.mutateAsync({
        id: ticketId,
        suggestionId: suggestion.id,
      });
      setFeedback("Suggestion deleted.");
      setSelected((current) => {
        const next = new Set(current);
        next.delete(suggestion.id);
        return next;
      });
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to delete suggestion.",
      );
    }
  }

  return (
    <>
      {pending.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Select pending suggestions on this page"
                checked={chosen.length === pending.length}
                disabled={disabled}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? new Set(pending.map((item) => item.id))
                      : new Set(),
                  );
                  setFeedback("");
                  setActionError("");
                }}
              />
              Select page
            </label>

            <span className="text-slate-600">
              {chosen.length} selected
            </span>

            <button
              type="button"
              disabled={
                disabled ||
                chosen.length === 0 ||
                conflictingFields
              }
              onClick={() => void review("accept", chosen)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Accept Selected
            </button>

            <button
              type="button"
              disabled={disabled || chosen.length === 0}
              onClick={() => void review("reject", chosen)}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Reject Selected
            </button>

            <button
              type="button"
              disabled={disabled || chosen.length === 0}
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-500 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>

          {conflictingFields ? (
            <p className="mt-2 text-xs text-amber-700">
              Select only one suggestion per field to
              accept. Multiple alternatives would
              overwrite each other.
            </p>
          ) : null}
        </div>
      ) : null}

      {bulkBusy ? (
        <p role="status" className="mt-2 text-sm text-slate-500">
          Processing suggestions…
        </p>
      ) : null}

      {feedback !== "" ? (
        <p role="status" className="mt-2 text-sm text-slate-600">
          {feedback}
        </p>
      ) : null}

      {actionError !== "" ? (
        <p
          role="alert"
          className="mt-2 whitespace-pre-wrap text-sm text-red-600"
        >
          {actionError}
        </p>
      ) : null}

      {query.isPending ? (
        <p className="mt-3 text-sm text-slate-500">
          Loading suggestions…
        </p>
      ) : query.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {query.error instanceof Error
            ? query.error.message
            : "Failed to load suggestions."}
        </p>
      ) : suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No AI suggestions on this page.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {suggestions.map((suggestion) => {
            const isExpanded = expanded.has(suggestion.id);
            const isLong =
              suggestion.suggestedValue.length > PREVIEW_LIMIT;
            const display =
              isLong && !isExpanded
                ? `${suggestion.suggestedValue.slice(0, PREVIEW_LIMIT)}…`
                : suggestion.suggestedValue;

            return (
              <li
                key={suggestion.id}
                className={`rounded-md border p-3 text-sm ${
                  suggestion.status === "PENDING" &&
                  selected.has(suggestion.id)
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {suggestion.status === "PENDING" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${suggestion.field} suggestion ${suggestion.id}`}
                      checked={selected.has(suggestion.id)}
                      disabled={disabled}
                      onChange={() =>
                        toggleSelected(suggestion.id)
                      }
                    />
                  ) : null}

                  <span className="font-medium text-slate-900">
                    {suggestion.field}
                  </span>

                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[suggestion.status]}`}
                  >
                    {suggestion.status}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  {metaLine(suggestion)}
                </p>

                <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">
                  {display}
                </p>

                {isLong ? (
                  <button
                    type="button"
                    onClick={() =>
                      toggleExpanded(suggestion.id)
                    }
                    className="mt-1 text-xs font-medium text-indigo-600"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                ) : null}

                {suggestion.currentValue !== null ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">
                    Current: {suggestion.currentValue}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          void review("accept", [suggestion])
                        }
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Accept
                      </button>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          void review("reject", [suggestion])
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setDeleteTarget(suggestion)}
                    title={
                      suggestion.status === "ACCEPTED"
                        ? "Merged ticket values remain after deletion."
                        : "Delete this suggestion record."
                    }
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete {suggestion.field} suggestion
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > 0 ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          disabled={disabled}
          itemLabel="suggestions"
          options={PAGE_SIZES}
          onPageChange={(next) => {
            setSelected(new Set());
            setExpanded(new Set());
            setFeedback("");
            setActionError("");
            setPage(next);
          }}
          onPageSizeChange={(size) => {
            setSelected(new Set());
            setExpanded(new Set());
            setFeedback("");
            setActionError("");
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget !== null && !busy) {
            void deleteSuggestion(deleteTarget);
          }
          setDeleteTarget(null);
        }}
        title="Delete suggestion"
        message={
          deleteTarget === null
            ? ""
            : deleteMessage(deleteTarget)
        }
      />
    </>
  );
}