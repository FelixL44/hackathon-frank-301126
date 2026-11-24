// Turns model output into domain observations and rejects anything not backed by the source.
import { Position, positionsOverlap, ProposedObservation } from "../domain/schema.ts";
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

const DIRECTION_WORDS: [RegExp, Position][] = [
  [/dianteir/, "front"],
  [/traseir/, "rear"],
  [/esquerd/, "left"],
  [/direit/, "right"],
];

/**
 * A quote that names directions must support the normalized position: "para-choques traseiro" cannot become
 * "bumper:front". Rejected only if none of the named directions overlaps, so "dianteiro e traseiro" allows either end.
 */
export function directionMismatch(quote: string, normalized: string | null): string | null {
  const position = Position.safeParse(normalized?.split(":")[1]).data;
  if (!position || position === "unknown") return null;
  const said = DIRECTION_WORDS.filter(([word]) => word.test(normalize(quote))).map(([, p]) => p);
  if (!said.length || said.some((p) => positionsOverlap(p, position))) return null;
  return `quote "${quote}" says ${said.join("/")}, but normalized position is ${position}`;
}

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
    } else if (locator.type === "text" && o.field === "damagedArea" && directionMismatch(locator.quote, o.normalized)) {
      errors.push(`${where}: ${directionMismatch(locator.quote, o.normalized)}`);
    } else {
      observations.push(candidate.data);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, observations };
}
