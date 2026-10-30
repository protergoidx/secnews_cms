import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import type { AvailableIntegration } from "../../lib/integrationsApi";
import {
  AI_PROVIDERS,
  type AiProviderKind,
  type AiRunBody,
  type AiSuggestion,
  type SourceDraftBody,
  type TicketSource,
} from "../../lib/ticketsApi";
import { useAvailableIntegrations } from "../../lib/useIntegrations";
import { useSourceDraft } from "../../lib/useTickets";
import { useSourceDraftStatuses } from "../../lib/useSourceDraftStatuses";
import { SuggestionList } from "./SuggestionList";
import { RelatedNewsPanel } from "./RelatedNewsPanel";

const SOURCE_DRAFT_FIELDS = [
  { value: "overview", label: "Overview" },
  { value: "description", label: "Description" },
  {
    value: "recommendations",
    label: "Recommendations",
  },
  { value: "references", label: "References" },
] as const;

const AUTO_PROVIDER = "AUTO";
const SOURCE_PREVIEW_LIMIT = 140;

type PickerValue =
  | AiProviderKind
  | typeof AUTO_PROVIDER;

type ApplyResponse = {
  applied: number;
  fields: string[];
};

interface SourceDraftPanelProps {
  ticketId: string;
  sources: TicketSource[];
}

const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function sourceName(source: TicketSource): string {
  return source.title || source.url || source.id;
}

function sourcePreview(source: TicketSource): string {
  return source.notes ?? source.note ?? "";
}

function isAiProvider(
  kind: string,
): kind is AiProviderKind {
  return AI_PROVIDERS.some(
    (provider) => provider === kind,
  );
}

function parsePickerValue(value: string): PickerValue {
  if (value === AUTO_PROVIDER) {
    return AUTO_PROVIDER;
  }

  return isAiProvider(value)
    ? value
    : AUTO_PROVIDER;
}

function fieldLabel(field: string): string {
  return (
    SOURCE_DRAFT_FIELDS.find(
      (item) => item.value === field,
    )?.label ?? field
  );
}

export function SourceDraftPanel({
  ticketId,
  sources,
}: SourceDraftPanelProps) {
  const cache = useQueryClient();
  const run = useSourceDraft();
  const availableQuery = useAvailableIntegrations();

  const [provider, setProvider] =
    useState<PickerValue>(AUTO_PROVIDER);
  const [model, setModel] = useState("");

  const [selectedSourceIds, setSelectedSourceIds] =
    useState<ReadonlySet<string>>(
      () => new Set(),
    );

  const [targetFields, setTargetFields] =
    useState<ReadonlySet<string>>(
      () =>
        new Set(
          SOURCE_DRAFT_FIELDS.map(
            (field) => field.value,
          ),
        ),
    );

  const [allowWebSearch, setAllowWebSearch] =
    useState(false);

  const [expandedPreviews, setExpandedPreviews] =
    useState<ReadonlySet<string>>(
      () => new Set(),
    );

  const [latestDrafts, setLatestDrafts] =
    useState<AiSuggestion[]>([]);

  const [draftTicketId, setDraftTicketId] =
    useState(ticketId);

  const [selectedDraftIds, setSelectedDraftIds] =
    useState<ReadonlySet<string>>(
      () => new Set(),
    );

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyMessage, setApplyMessage] =
    useState("");

  const busy = run.isPending || applying;

  const keyedProviders = (
    availableQuery.data ?? []
  ).filter(
    (
      item,
    ): item is AvailableIntegration & {
      kind: AiProviderKind;
    } =>
      item.hasKey && isAiProvider(item.kind),
  );

  const modelPlaceholder =
    keyedProviders.find(
      (item) => item.kind === provider,
    )?.model ?? "default";

  const activeSourceIds = sources
    .filter((source) =>
      selectedSourceIds.has(source.id),
    )
    .map((source) => source.id);

  const activeTargetFields =
    SOURCE_DRAFT_FIELDS.filter((field) =>
      targetFields.has(field.value),
    ).map((field) => field.value);

  const canRun =
    activeSourceIds.length > 0 &&
    activeSourceIds.length <= 20 &&
    activeTargetFields.length > 0;

  const previewDrafts =
    draftTicketId === ticketId
      ? latestDrafts
      : [];

  const draftStatuses = useSourceDraftStatuses(
    ticketId,
    previewDrafts.map((draft) => draft.id),
  );

  const currentDrafts = previewDrafts.map((draft) => {
    const serverStatus =
      draftStatuses.data?.[draft.id];

    if (
      draft.status !== "PENDING" ||
      serverStatus === undefined
    ) {
      return draft;
    }

    return {
      ...draft,
      status: serverStatus,
    };
  });

  const pendingDrafts = currentDrafts.filter(
    (draft) =>
      draft.status === "PENDING" &&
      draftStatuses.isSuccess &&
      draftStatuses.data[draft.id] === "PENDING",
  );

  const selectedDrafts = pendingDrafts.filter(
    (draft) => selectedDraftIds.has(draft.id),
  );

  const selectedFields = selectedDrafts.map(
    (draft) => draft.field,
  );

  const duplicateFields =
    new Set(selectedFields).size !==
    selectedFields.length;

  const allDraftsSelected =
    pendingDrafts.length > 0 &&
    pendingDrafts.every((draft) =>
      selectedDraftIds.has(draft.id),
    );

  function togglePreview(id: string): void {
    setExpandedPreviews((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleSource(
    id: string,
    checked: boolean,
  ): void {
    setSelectedSourceIds((current) => {
      const next = new Set(current);

      if (checked) {
        if (next.size < 20) {
          next.add(id);
        }
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  function toggleField(
    field: string,
    checked: boolean,
  ): void {
    setTargetFields((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(field);
      } else {
        next.delete(field);
      }

      return next;
    });
  }

  function toggleDraft(
    draft: AiSuggestion,
    checked: boolean,
  ): void {
    setApplyError("");
    setApplyMessage("");

    setSelectedDraftIds((current) => {
      const next = new Set(current);

      if (checked) {
        for (const existing of pendingDrafts) {
          if (existing.field === draft.field) {
            next.delete(existing.id);
          }
        }

        next.add(draft.id);
      } else {
        next.delete(draft.id);
      }

      return next;
    });
  }

  function selectAllDrafts(checked: boolean): void {
    if (!checked) {
      setSelectedDraftIds(new Set());
      return;
    }

    const seenFields = new Set<string>();
    const ids = new Set<string>();

    for (const draft of pendingDrafts) {
      if (!seenFields.has(draft.field)) {
        seenFields.add(draft.field);
        ids.add(draft.id);
      }
    }

    setSelectedDraftIds(ids);
  }

  function aiBody(): AiRunBody {
    if (provider === AUTO_PROVIDER) {
      return {};
    }

    const trimmedModel = model.trim();

    return trimmedModel === ""
      ? { provider }
      : {
          provider,
          model: trimmedModel,
        };
  }

  function onRun(): void {
    if (!canRun || busy) {
      return;
    }

    const requestedTicketId = ticketId;

    const body: SourceDraftBody = {
      sourceIds: activeSourceIds,
      targetFields: activeTargetFields,
      allowWebSearch:
        allowWebSearch &&
        targetFields.has("references"),
      ...aiBody(),
    };

    setApplyError("");
    setApplyMessage("");

    run.mutate(
      {
        id: requestedTicketId,
        body,
      },
      {
        onSuccess: (data) => {
          const drafts = data.suggestions.filter(
            (suggestion) =>
              suggestion.status === "PENDING" &&
              suggestion.origin === "SOURCE_DRAFT",
          );

          setDraftTicketId(requestedTicketId);
          setLatestDrafts(drafts);

          const seenFields = new Set<string>();
          const ids = new Set<string>();

          for (const draft of drafts) {
            if (!seenFields.has(draft.field)) {
              seenFields.add(draft.field);
              ids.add(draft.id);
            }
          }

          setSelectedDraftIds(ids);
        },
      },
    );
  }

  async function applySelected(): Promise<void> {
    if (
      busy ||
      draftStatuses.isFetching ||
      !draftStatuses.isSuccess ||
      selectedDrafts.length === 0 ||
      selectedDrafts.length > 4 ||
      duplicateFields
    ) {
      return;
    }

    const requestedTicketId = ticketId;
    const appliedIds = selectedDrafts.map(
      (draft) => draft.id,
    );

    setApplying(true);
    setApplyError("");
    setApplyMessage("");

    try {
      const response = await apiFetch(
        `/tickets/${requestedTicketId}/ai/source-draft/apply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            suggestionIds: appliedIds,
          }),
        },
      );

      const result =
        (await response.json()) as ApplyResponse;

      const savedIds = new Set(appliedIds);

      setLatestDrafts((current) =>
        current.map((draft) =>
          savedIds.has(draft.id)
            ? {
                ...draft,
                status: "ACCEPTED",
              }
            : draft,
        ),
      );

      setSelectedDraftIds(new Set());

      const referencesApplied =
        result.fields.includes("references");

      setApplyMessage(
        `${result.applied} field(s) applied.${
          referencesApplied
            ? " References were merged with the existing list."
            : ""
        }`,
      );

      await Promise.all([
        cache.invalidateQueries({
          queryKey: [
            "ticket",
            requestedTicketId,
          ],
        }),
        cache.invalidateQueries({
          queryKey: [
            "suggestions",
            requestedTicketId,
          ],
        }),
        cache.invalidateQueries({
          queryKey: [
            "ticket-activity",
            requestedTicketId,
          ],
        }),
        cache.invalidateQueries({
          queryKey: ["tickets"],
        }),
      ]);
    } catch (caught) {
      setApplyError(
        caught instanceof Error
          ? caught.message
          : "Failed to apply the selected draft.",
      );

      // Refresh statuses if another action resolved
      // one of the suggestions before this request.
      void cache.invalidateQueries({
        queryKey: [
          "suggestions",
          requestedTicketId,
        ],
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <section
      id="source-draft-assist"
      className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">
        Source Draft Assist
      </h2>

      <p className="mt-1 text-sm leading-6 text-slate-500">
        Select supporting sources, generate a draft,
        then review and apply the fields you want.
        Overview and Description replace the selected
        field. References are merged with existing links.
      </p>

      <p className="mt-2 text-xs text-slate-500">
        Save manual edits in Final fields before
        applying a draft to those same fields.
      </p>

      <RelatedNewsPanel
        key={ticketId}
        ticketId={ticketId}
        sources={sources}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <fieldset
          disabled={busy}
          className="min-w-0"
        >
          <legend className="text-sm font-medium text-slate-700">
            1. Select sources
          </legend>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                setSelectedSourceIds(
                  new Set(
                    sources
                      .slice(0, 20)
                      .map((source) => source.id),
                  ),
                )
              }
            >
              {sources.length > 20
                ? "Select first 20"
                : "Select all"}
            </button>

            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                setSelectedSourceIds(new Set())
              }
            >
              Clear
            </button>

            <span className="text-xs text-slate-500">
              {activeSourceIds.length}/20 selected
            </span>
          </div>

          {sources.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Add a source to this ticket first.
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {sources.map((source) => {
                const preview =
                  sourcePreview(source);

                const isLong =
                  preview.length >
                  SOURCE_PREVIEW_LIMIT;

                const expanded =
                  expandedPreviews.has(source.id);

                const display =
                  isLong && !expanded
                    ? `${preview.slice(
                        0,
                        SOURCE_PREVIEW_LIMIT,
                      )}…`
                    : preview;

                const selected =
                  selectedSourceIds.has(source.id);

                return (
                  <li
                    key={source.id}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Select source: ${sourceName(source)}`}
                        checked={selected}
                        disabled={
                          busy ||
                          (!selected &&
                            activeSourceIds.length >= 20)
                        }
                        onChange={(event) =>
                          toggleSource(
                            source.id,
                            event.target.checked,
                          )
                        }
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />

                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium text-slate-900">
                          {sourceName(source)}
                        </span>

                        {source.url ? (
                          <span className="mt-1 block break-all text-xs text-slate-500">
                            {source.url}
                          </span>
                        ) : null}
                      </span>
                    </label>

                    {preview !== "" ? (
                      <div className="ml-6 mt-2">
                        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
                          {display}
                        </p>

                        {isLong ? (
                          <button
                            type="button"
                            onClick={() =>
                              togglePreview(source.id)
                            }
                            className="mt-1 text-xs font-medium text-indigo-600"
                          >
                            {expanded
                              ? "Show less"
                              : "Show more"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <fieldset
          disabled={busy}
          className="min-w-0"
        >
          <legend className="text-sm font-medium text-slate-700">
            2. Choose fields to draft
          </legend>

          <div className="mt-3 space-y-2">
            {SOURCE_DRAFT_FIELDS.map((field) => (
              <label
                key={field.value}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={targetFields.has(
                    field.value,
                  )}
                  onChange={(event) =>
                    toggleField(
                      field.value,
                      event.target.checked,
                    )
                  }
                  className="h-4 w-4 accent-indigo-600"
                />

                {field.label}
              </label>
            ))}
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Select References to include valid URLs
            from your selected sources in the
            References suggestion.
          </p>

          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allowWebSearch}
              disabled={
                busy ||
                !targetFields.has("references")
              }
              onChange={(event) =>
                setAllowWebSearch(
                  event.target.checked,
                )
              }
              className="mt-1 h-4 w-4 accent-indigo-600"
            />

            Allow provider web search for References
          </label>

          <p className="mt-1 text-xs leading-5 text-slate-500">
            Requires browsing support from the
            configured provider. Enabling this option
            does not guarantee an online search.
          </p>
        </fieldset>
      </div>

      <fieldset
        disabled={busy}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Provider

          <select
            aria-label="AI provider"
            value={provider}
            onChange={(event) =>
              setProvider(
                parsePickerValue(
                  event.target.value,
                ),
              )
            }
            className={inputClass}
          >
            <option value={AUTO_PROVIDER}>
              Auto (first configured)
            </option>

            {keyedProviders.map((item) => (
              <option
                key={item.kind}
                value={item.kind}
              >
                {item.kind}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Model

          <input
            aria-label="AI model (optional)"
            value={model}
            onChange={(event) =>
              setModel(event.target.value)
            }
            placeholder={modelPlaceholder}
            className={`${inputClass} w-48`}
          />
        </label>

        <button
          type="button"
          onClick={onRun}
          disabled={
            !canRun ||
            busy ||
            availableQuery.isPending ||
            availableQuery.isError ||
            keyedProviders.length === 0
          }
          className={`${buttonClass} flex items-center gap-2`}
        >
          {run.isPending ? <Spinner /> : null}

          {run.isPending
            ? "Generating…"
            : "Generate draft"}
        </button>
      </fieldset>

      {availableQuery.isError ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          Could not load provider configuration.
          Reload the page or check Integrations.
        </p>
      ) : null}

      {!availableQuery.isPending &&
      !availableQuery.isError &&
      keyedProviders.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No AI provider is configured. Generation
          becomes available after an administrator
          adds a key under Integrations. Existing
          suggestions remain available below.
        </p>
      ) : null}

      {run.isError ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          {run.error instanceof Error
            ? run.error.message
            : "Source draft failed."}
        </p>
      ) : null}

      {currentDrafts.length > 0 ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                3. Review latest draft
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Check the content and supporting links
                before applying.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allDraftsSelected}
                disabled={
                  busy ||
                  draftStatuses.isFetching ||
                  draftStatuses.isError ||
                  pendingDrafts.length === 0
                }
                onChange={(event) =>
                  selectAllDrafts(
                    event.target.checked,
                  )
                }
                className="h-4 w-4 accent-indigo-600"
              />

              Select all fields
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {currentDrafts.map((draft) => {
              const accepted =
                draft.status === "ACCEPTED";

              const missing =
                draftStatuses.isSuccess &&
                !draftStatuses.isFetching &&
                draftStatuses.data[draft.id] ===
                  undefined;

              const unavailable =
                missing ||
                draft.status !== "PENDING" ||
                !draftStatuses.isSuccess ||
                draftStatuses.isFetching;

              return (
                <article
                  key={draft.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <input
                      type="checkbox"
                      checked={
                        !unavailable &&
                        selectedDraftIds.has(draft.id)
                      }
                      disabled={busy || unavailable}
                      onChange={(event) =>
                        toggleDraft(
                          draft,
                          event.target.checked,
                        )
                      }
                      className="h-4 w-4 accent-indigo-600"
                    />

                    {fieldLabel(draft.field)}

                    <span className="ml-auto text-xs font-normal text-slate-500">
                      {missing
                        ? "Unavailable"
                        : accepted
                          ? "Applied"
                          : draft.status}
                    </span>
                  </label>

                  <p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                    {draft.suggestedValue}
                  </p>

                  {draft.field === "references" ? (
                    <p className="mt-3 text-xs text-slate-500">
                      These links will be merged with
                      existing References. Duplicate
                      links are removed. URL validation
                      does not verify source claims.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          {duplicateFields ? (
            <p
              role="alert"
              className="mt-3 text-sm text-red-600"
            >
              Select only one suggestion per field.
            </p>
          ) : null}

          {draftStatuses.isFetching ? (
            <p
              role="status"
              className="mt-3 text-xs text-slate-500"
            >
              Updating suggestion statuses…
            </p>
          ) : null}

          {draftStatuses.isError ? (
            <div className="mt-3">
              <p
                role="alert"
                className="text-sm text-red-600"
              >
                Could not refresh suggestion statuses.
                Retry before applying the preview.
              </p>

              <button
                type="button"
                disabled={
                  busy ||
                  draftStatuses.isFetching
                }
                onClick={() =>
                  void draftStatuses.refetch()
                }
                className={`${secondaryClass} mt-2`}
              >
                Retry status refresh
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void applySelected()}
            disabled={
              busy ||
              draftStatuses.isFetching ||
              !draftStatuses.isSuccess ||
              selectedDrafts.length === 0 ||
              selectedDrafts.length > 4 ||
              duplicateFields
            }
            className={`${buttonClass} mt-4`}
          >
            {applying
              ? "Applying…"
              : `Apply ${selectedDrafts.length} selected field(s)`}
          </button>

          <p className="mt-2 text-xs text-slate-500">
            Selected fields are saved together.
            If validation fails, none of those
            fields are applied.
          </p>
        </div>
      ) : null}

      {applyError ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          {applyError}
        </p>
      ) : null}

      {applyMessage ? (
        <p
          role="status"
          className="mt-3 text-sm text-emerald-700"
        >
          {applyMessage}
        </p>
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">
          Suggestion history
        </h3>

        <p className="mt-1 text-xs text-slate-500">
          Includes the latest run and earlier
          suggestions. Preview statuses refresh
          after Accept, Reject, or Delete actions.
        </p>

        <SuggestionList
          ticketId={ticketId}
          origin={["SOURCE_DRAFT"]}
        />
      </div>
    </section>
  );
}