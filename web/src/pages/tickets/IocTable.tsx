import { useState } from "react";
import {
  IOC_TYPES,
  type Ioc,
  type IocType,
} from "../../lib/ticketsApi";
import {
  useAddIoc,
  useDeleteIoc,
  useUpdateIoc,
} from "../../lib/useTickets";
import { BulkIocInput } from "./BulkIocInput";

interface IocTableProps {
  ticketId: string;
  iocs: Ioc[];
}

const inputClass =
  "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50";

export function IocTable({ ticketId, iocs }: IocTableProps) {
  const [type, setType] = useState<IocType>("DOMAIN");
  const [value, setValue] = useState("");
  const [context, setContext] = useState("");

  const addIoc = useAddIoc();
  const updateIoc = useUpdateIoc();
  const deleteIoc = useDeleteIoc();

  const rowActionPending =
    updateIoc.isPending || deleteIoc.isPending;

  const rowActionError =
    updateIoc.error ?? deleteIoc.error;

  const submit = (): void => {
    if (value.trim() === "" || addIoc.isPending) {
      return;
    }

    addIoc.mutate(
      {
        id: ticketId,
        body: {
          type,
          value: value.trim(),
          ...(context.trim() === ""
            ? {}
            : { context: context.trim() }),
          includeInBulletin: true,
        },
      },
      {
        onSuccess: () => {
          setValue("");
          setContext("");
        },
      },
    );
  };

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Indicators (IOCs)
      </h2>

      <p className="mt-1 text-sm text-slate-500">
        Add indicators individually or use bulk input below.
        Only included indicators appear in the bulletin and
        OTX push.
      </p>

      {iocs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No indicators yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th
                  scope="col"
                  className="py-2 pr-4 font-medium"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="py-2 pr-4 font-medium"
                >
                  Value
                </th>
                <th
                  scope="col"
                  className="py-2 pr-4 font-medium"
                >
                  Context
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap py-2 pr-4 font-medium"
                >
                  In bulletin
                </th>
                <th
                  scope="col"
                  className="py-2 font-medium"
                >
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {iocs.map((ioc) => (
                <tr
                  key={ioc.id}
                  className="border-b border-slate-100"
                >
                  <td className="py-3 pr-4 text-slate-700">
                    {ioc.type}
                  </td>

                  <td className="max-w-md break-all py-3 pr-4 font-mono text-slate-900">
                    {ioc.value}
                  </td>

                  <td className="min-w-32 break-words py-3 pr-4 text-slate-500">
                    {ioc.context ?? "—"}
                  </td>

                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      aria-label={`Include ${ioc.value} in bulletin`}
                      checked={ioc.includeInBulletin}
                      disabled={rowActionPending}
                      onChange={(event) => {
                        deleteIoc.reset();

                        updateIoc.mutate({
                          id: ticketId,
                          iocId: ioc.id,
                          patch: {
                            includeInBulletin:
                              event.target.checked,
                          },
                        });
                      }}
                      className="h-4 w-4 accent-indigo-600 disabled:opacity-50"
                    />
                  </td>

                  <td className="py-3">
                    <button
                      type="button"
                      aria-label={`Delete ${ioc.value}`}
                      disabled={rowActionPending}
                      onClick={() => {
                        updateIoc.reset();

                        deleteIoc.mutate({
                          id: ticketId,
                          iocId: ioc.id,
                        });
                      }}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rowActionError !== null ? (
        <p
          role="alert"
          className="mt-3 text-sm text-red-600"
        >
          {rowActionError instanceof Error
            ? rowActionError.message
            : "Failed to update indicator."}
        </p>
      ) : null}

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">
            Type
          </span>

          <select
            aria-label="IOC type"
            value={type}
            disabled={addIoc.isPending}
            onChange={(event) =>
              setType(event.target.value as IocType)
            }
            className={inputClass}
          >
            {IOC_TYPES.map((iocType) => (
              <option key={iocType} value={iocType}>
                {iocType}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1 sm:w-72">
          <span className="text-xs text-slate-500">
            Value
          </span>

          <input
            aria-label="IOC value"
            type="text"
            required
            value={value}
            disabled={addIoc.isPending}
            onChange={(event) =>
              setValue(event.target.value)
            }
            className={`${inputClass} w-full font-mono`}
          />
        </label>

        <label className="flex w-full flex-col gap-1 sm:w-56">
          <span className="text-xs text-slate-500">
            Context
          </span>

          <input
            aria-label="IOC context"
            type="text"
            value={context}
            disabled={addIoc.isPending}
            onChange={(event) =>
              setContext(event.target.value)
            }
            className={`${inputClass} w-full`}
          />
        </label>

        <button
          type="submit"
          disabled={
            value.trim() === "" || addIoc.isPending
          }
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {addIoc.isPending ? "Adding…" : "Add IOC"}
        </button>

        {addIoc.isError ? (
          <p
            role="alert"
            className="w-full text-sm text-red-600"
          >
            {addIoc.error instanceof Error
              ? addIoc.error.message
              : "Failed to add IOC."}
          </p>
        ) : null}
      </form>

      <BulkIocInput
        key={ticketId}
        ticketId={ticketId}
      />
    </section>
  );
}