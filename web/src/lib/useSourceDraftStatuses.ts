import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { AiSuggestion } from "./ticketsApi";

type SuggestionPage = {
  items: AiSuggestion[];
  total: number;
};

type SuggestionStatus = AiSuggestion["status"];

export function useSourceDraftStatuses(
  ticketId: string,
  suggestionIds: readonly string[],
) {
  const ids = [...new Set(suggestionIds)].sort();
  const idsKey = ids.join(",");

  return useQuery({
    queryKey: [
      "suggestions",
      ticketId,
      "source-draft-preview-status",
      idsKey,
    ],
    enabled: ticketId !== "" && ids.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const wanted = new Set(ids);
      const statuses: Record<
        string,
        SuggestionStatus
      > = {};

      let page = 1;
      let loaded = 0;
      let total = 0;

      do {
        const params = new URLSearchParams({
          origin: "SOURCE_DRAFT",
          page: String(page),
          pageSize: "20",
        });

        const response = await apiFetch(
          `/tickets/${ticketId}/suggestions?${params.toString()}`,
          { signal },
        );

        const data =
          (await response.json()) as SuggestionPage;

        if (
          !Array.isArray(data.items) ||
          !Number.isFinite(data.total) ||
          data.total < 0
        ) {
          throw new Error(
            "Could not read suggestion statuses.",
          );
        }

        total = data.total;
        loaded += data.items.length;

        for (const item of data.items) {
          if (wanted.has(item.id)) {
            statuses[item.id] = item.status;
            wanted.delete(item.id);
          }
        }

        if (
          wanted.size === 0 ||
          data.items.length === 0
        ) {
          break;
        }

        page++;

        if (page > 10000) {
          throw new Error(
            "Too many suggestion pages. Reload the ticket.",
          );
        }
      } while (loaded < total);

      return statuses;
    },
  });
}