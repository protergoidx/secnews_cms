import { useState } from "react";
import { TranslateButton } from "../../components/TranslateButton";
import {
  TLP_LEVELS,
  type TicketDetail,
  type Tlp,
} from "../../lib/ticketsApi";
import { usePatchTicketFields } from "../../lib/useTickets";

interface FinalFieldsFormProps {
  ticket: TicketDetail;
}

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none";

export function FinalFieldsForm({
  ticket,
}: FinalFieldsFormProps) {
  const [title, setTitle] = useState(ticket.title);
  const [overview, setOverview] = useState(
    ticket.overview ?? "",
  );
  const [description, setDescription] = useState(
    ticket.description ?? "",
  );
  const [recommendations, setRecommendations] =
    useState(ticket.recommendations ?? "");
  const [references, setReferences] = useState(
    ticket.references.join("\n"),
  );
  const [tlp, setTlp] = useState<Tlp>(ticket.tlp);
  const [saved, setSaved] = useState(false);

  const [previousTicket, setPreviousTicket] =
    useState(ticket);

  const patchFields = usePatchTicketFields();

  /*
   * Saat query ticket mendapat data baru setelah Accept AI,
   * sinkronkan hanya field yang berubah di server.
   * Edit lokal pada field lain tetap dipertahankan.
   */
  if (previousTicket !== ticket) {
    const changedTicket =
      previousTicket.id !== ticket.id;

    setPreviousTicket(ticket);

    if (
      changedTicket ||
      previousTicket.title !== ticket.title
    ) {
      setTitle(ticket.title);
    }

    if (
      changedTicket ||
      previousTicket.overview !== ticket.overview
    ) {
      setOverview(ticket.overview ?? "");
    }

    if (
      changedTicket ||
      previousTicket.description !== ticket.description
    ) {
      setDescription(ticket.description ?? "");
    }

    if (
      changedTicket ||
      previousTicket.recommendations !==
        ticket.recommendations
    ) {
      setRecommendations(ticket.recommendations ?? "");
    }

    if (
      changedTicket ||
      previousTicket.references.join("\n") !==
        ticket.references.join("\n")
    ) {
      setReferences(ticket.references.join("\n"));
    }

    if (
      changedTicket ||
      previousTicket.tlp !== ticket.tlp
    ) {
      setTlp(ticket.tlp);
    }

    setSaved(false);
  }

  function markEdited(): void {
    setSaved(false);
    patchFields.reset();
  }

  function submit(): void {
    if (
      patchFields.isPending ||
      title.trim() === ""
    ) {
      return;
    }

    setSaved(false);

    patchFields.mutate(
      {
        id: ticket.id,
        patch: {
          title: title.trim(),
          overview,
          description,
          recommendations,
          references: references
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== ""),
          tlp,
        },
      },
      {
        onSuccess: () => setSaved(true),
      },
    );
  }

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Final fields
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Review the bulletin content before saving.
        Translation previews can be applied to each
        field.
      </p>

      <form
        className="mt-4 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset
          disabled={patchFields.isPending}
          className="flex min-w-0 flex-col gap-5"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              Title
            </span>

            <input
              aria-label="Title"
              type="text"
              required
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                markEdited();
              }}
              className={inputClass}
            />
          </label>

          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">
                Overview
              </span>

              <textarea
                aria-label="Overview"
                rows={8}
                value={overview}
                onChange={(event) => {
                  setOverview(event.target.value);
                  markEdited();
                }}
                className={`${inputClass} min-h-44 resize-y`}
              />
            </label>

            <TranslateButton
              key={`${ticket.id}-overview`}
              text={overview}
              onApply={(translation) => {
                setOverview(translation);
                markEdited();
              }}
            />
          </div>

          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">
                Description
              </span>

              <textarea
                aria-label="Description"
                rows={12}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  markEdited();
                }}
                className={`${inputClass} min-h-64 resize-y`}
              />
            </label>

            <TranslateButton
              key={`${ticket.id}-description`}
              text={description}
              onApply={(translation) => {
                setDescription(translation);
                markEdited();
              }}
            />
          </div>

          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">
                Recommendations
              </span>

              <textarea
                aria-label="Recommendations"
                rows={8}
                value={recommendations}
                onChange={(event) => {
                  setRecommendations(event.target.value);
                  markEdited();
                }}
                className={`${inputClass} min-h-44 resize-y`}
              />
            </label>

            <TranslateButton
              key={`${ticket.id}-recommendations`}
              text={recommendations}
              onApply={(translation) => {
                setRecommendations(translation);
                markEdited();
              }}
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              References (one per line)
            </span>

            <textarea
              aria-label="References (one per line)"
              rows={4}
              value={references}
              onChange={(event) => {
                setReferences(event.target.value);
                markEdited();
              }}
              placeholder="https://…"
              className={`${inputClass} resize-y`}
            />
          </label>

          <label className="flex w-40 flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              TLP
            </span>

            <select
              aria-label="TLP"
              value={tlp}
              onChange={(event) => {
                setTlp(event.target.value as Tlp);
                markEdited();
              }}
              className={inputClass}
            >
              {TLP_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={
              patchFields.isPending ||
              title.trim() === ""
            }
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {patchFields.isPending
              ? "Saving…"
              : "Save fields"}
          </button>

          {saved ? (
            <span
              role="status"
              className="text-sm text-emerald-700"
            >
              Saved.
            </span>
          ) : null}

          {patchFields.isError ? (
            <p
              role="alert"
              className="text-sm text-red-600"
            >
              {patchFields.error instanceof Error
                ? patchFields.error.message
                : "Failed to save fields."}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}