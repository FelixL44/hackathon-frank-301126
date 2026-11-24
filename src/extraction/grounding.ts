// Turns model output into domain observations and rejects anything not backed by the source.
import { ProposedObservation } from "../domain/schema.ts";
import { ModelOutput } from "./prompt.ts";

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** True when the quote occurs on that page, ignoring case, quote style and whitespace. */
export const quoteOnPage = (pages: readonly string[], quote: string, page: number) =>
  page >= 1 && page <= pages.length && normalize(pages[page - 1]!).includes(normalize(quote));

export type Grounded = { ok: true; observations: ProposedObservation[] } | { ok: false; errors: string[] };

/** `pages` is the text layer for text/PDF sources, null for photos. */
export function groundObservations(source: { sourceId: string }, pages: readonly string[] | null, raw: unknown): Grounded {
  const parsed = ModelOutput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "output"}: ${i.message}`) };
  }
  const errors: string[] = [];
  const observations: ProposedObservation[] = [];
  parsed.data.observations.forEach((o, i) => {
    const where = `observations.${i} (${o.field})`;
    const locator =
      pages === null
        ? { type: "image" as const, imageId: source.sourceId, description: o.visualDescription ?? "" }
        : { type: "text" as const, quote: o.quote ?? "", page: o.page ?? 0 };
    const candidate = ProposedObservation.safeParse({ ...o, locator });
    if (!candidate.success) {
      errors.push(`${where}: ${candidate.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
    } else if (locator.type === "text" && !quoteOnPage(pages!, locator.quote, locator.page)) {
      errors.push(`${where}: quote "${locator.quote}" does not occur on page ${locator.page}`);
    } else {
      observations.push(candidate.data);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, observations };
}
