import type { PrismaClient } from "../../generated/prisma/client.js";
import { PromptKind } from "../../generated/prisma/enums.js";
import { mergeReferences } from "../../common/references.js";
import {
  currentValueOf,
  parseModelFields,
  SYSTEM_PROMPT,
  type SourceDraftField,
  type TicketWithRelations,
} from "./prompts.js";
import {
  loadPromptTemplate,
  renderPromptTemplate,
  sourceDraftPromptBindings,
} from "./prompt-template.js";
import {
  runCompletion,
  type ProviderChoice,
  type ProviderRun,
  type SuggestionDraft,
} from "./service.js";

const WEB_SEARCH_AUGMENTATION = [
  "# Web search augmentation (references only)",
  "The analyst enabled online web search for the references field.",
  "Use live web browsing only when your runtime actually provides it.",
  "You may add reputable supporting references beyond the selected sources.",
  "Never invent or guess URLs.",
  "Keep selected source URLs listed first.",
  "Return references as HTTP/HTTPS URLs, one per line, without headings or commentary.",
  "Every other requested field must remain grounded in the selected sources.",
].join("\n");

function orderSources(
  sources: TicketWithRelations["sources"],
  sourceIds: readonly string[],
): TicketWithRelations["sources"] {
  const byId = new Map(
    sources.map((source) => [source.id, source] as const),
  );

  return sourceIds.flatMap((id) => {
    const source = byId.get(id);

    return source === undefined ? [] : [source];
  });
}

function selectedSourceUrls(
  sources: TicketWithRelations["sources"],
): string[] {
  const urls: string[] = [];

  for (const source of sources) {
    const value = source.url?.trim();

    if (!value) {
      continue;
    }

    try {
      const url = new URL(value);

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username !== "" ||
        url.password !== "" ||
        /\s/.test(value)
      ) {
        continue;
      }

      urls.push(url.href);
    } catch {
      // A source may contain notes without a valid URL.
      // It can still support the draft but is not a URL reference.
    }
  }

  return [...new Set(urls)];
}

type GeneratedDraft = {
  model: string;
  provider: ProviderRun["kind"];
} & SuggestionDraft;

export async function generateSourceDraftSuggestions(
  db: PrismaClient,
  ticket: TicketWithRelations,
  input: {
    sourceIds: string[];
    targetFields: SourceDraftField[];
    allowWebSearch: boolean;
    explicit: ProviderChoice;
  },
): Promise<GeneratedDraft[]> {
  const chosen = orderSources(
    ticket.sources,
    input.sourceIds,
  );

  const targetFields = [...new Set(input.targetFields)];

  const template = await loadPromptTemplate(
    db,
    PromptKind.SOURCE_DRAFT,
  );

  let prompt = renderPromptTemplate(
    template,
    sourceDraftPromptBindings(
      ticket,
      chosen,
      targetFields,
    ),
  );

  if (targetFields.includes("references")) {
    prompt += [
      "",
      "# References output format",
      "Return HTTP/HTTPS URLs, one per line.",
      "Do not include a heading, explanation, or comma-separated list.",
      "Only include references relevant to the requested draft.",
    ].join("\n");
  }

  if (
    input.allowWebSearch &&
    targetFields.includes("references")
  ) {
    prompt += `\n\n${WEB_SEARCH_AUGMENTATION}`;
  }

  const { raw, kind, model } = await runCompletion(
    db,
    input.explicit,
    SYSTEM_PROMPT,
    prompt,
  );

  const fields = parseModelFields(raw);
  const drafts: GeneratedDraft[] = [];

  for (const field of targetFields) {
    let suggested = fields.get(field);

    if (field === "references") {
      const sourceUrls = selectedSourceUrls(chosen);

      /*
       * Include URLs from the sources explicitly selected
       * by the analyst, even if the model omits them.
       *
       * Additional model URLs are format-validated and
       * deduplicated. This does not verify page availability
       * or prove that a reference supports the draft.
       */
      const merged = mergeReferences(
        sourceUrls,
        suggested ?? "",
      );

      if (merged.length === 0) {
        continue;
      }

      suggested = merged.join("\n");
    }

    if (
      suggested === undefined ||
      suggested.trim() === ""
    ) {
      continue;
    }

    drafts.push({
      field,
      currentValue: currentValueOf(ticket, field),
      suggestedValue: suggested,
      model,
      provider: kind,
    });
  }

  return drafts;
}