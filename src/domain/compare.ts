// Cross-source comparison (HAC-9). Pure: current, legible observations in; conflict findings with evidence out.
// Compared: vehicle, incident date, damaged area ("vehicle, damaged part or event" in CLAUDE.md).
// Not compared: the free-text event description and the policy number.
import { usableCurrent, type ArtifactLike, type ObservationLike } from "./filing.ts";
import { Position, positionsOverlap, type EvidenceRef, type Locator, type RequiredField } from "./schema.ts";

type Obs = ObservationLike & { locator: Locator };
export type Conflict = { rule: "conflict"; field: RequiredField; evidence: EvidenceRef[]; explanation: string };

const ref = (o: Obs): EvidenceRef => ({ sourceId: o.sourceId, version: o.version, locator: o.locator });
const valueOf = (o: Obs) => o.normalized ?? o.value!;
const plate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""); // "aa 12-bc" equals "AA-12-BC"

/** Identity: one conflict when two sources state different values (ignoring formatting). */
function identityConflict(field: RequiredField, obs: Obs[], same: (s: string) => string, label: string): Conflict | null {
  const firstPerValue = new Map<string, Obs>();
  for (const o of obs.filter((o) => o.field === field)) {
    if (!firstPerValue.has(same(valueOf(o)))) firstPerValue.set(same(valueOf(o)), o);
  }
  const distinct = [...firstPerValue.values()];
  if (distinct.length < 2 || new Set(distinct.map((o) => o.sourceId)).size < 2) return null;
  return {
    rule: "conflict",
    field,
    evidence: distinct.map(ref),
    explanation: `The ${label} differs between sources: ${distinct.map((o) => `${o.sourceId} says ${valueOf(o)}`).join(", ")}.`,
  };
}

const positionOf = (o: Obs) => Position.safeParse(o.normalized?.split(":")[1]).data;

/**
 * Damaged area: every area in a photo or estimate must overlap an area the customer reports. Several areas in the
 * report are all accepted, so "front and rear" in the account never conflicts with an estimate for the rear.
 * Without areas in the account, the photo is the reference. An unknown position never conflicts.
 */
function areaConflict(obs: Obs[], kindOf: (sourceId: string) => string | undefined): Conflict | null {
  const areas = obs.filter((o) => o.field === "damagedArea" && positionOf(o) && positionOf(o) !== "unknown");
  const from = (kind: string) => areas.filter((o) => kindOf(o.sourceId) === kind);
  const reference = from("message").length ? from("message") : from("photo");
  if (!reference.length) return null;
  const unsupported = areas.filter(
    (o) => !reference.includes(o) && !reference.some((r) => positionsOverlap(positionOf(r)!, positionOf(o)!)),
  );
  if (!unsupported.length) return null;
  const said = (list: Obs[]) => [...new Set(list.map(valueOf))].join(" and ");
  return {
    rule: "conflict",
    field: "damagedArea",
    evidence: [...reference, ...unsupported].map(ref),
    explanation:
      `${reference[0]!.sourceId} reports ${said(reference)}, but ` +
      `${[...new Set(unsupported.map((o) => o.sourceId))].join(", ")} shows ${said(unsupported)}, which the report does not mention.`,
  };
}

export function compareSources(artifacts: readonly ArtifactLike[], observations: readonly Obs[]): Conflict[] {
  const obs = usableCurrent(artifacts, observations);
  const kindOf = (sourceId: string) => artifacts.find((a) => a.sourceId === sourceId)?.kind;
  return [
    identityConflict("vehicleId", obs, plate, "vehicle"),
    identityConflict("incidentDate", obs, (s) => s, "incident date"),
    areaConflict(obs, kindOf),
  ].filter((c): c is Conflict => c !== null);
}

/** Identity of a conflict: same field and same cited source versions. New evidence → new key → review again. */
export const conflictKey = (field: string | null, evidence: readonly EvidenceRef[]) =>
  `${field}|${[...new Set(evidence.map((e) => `${e.sourceId}@${e.version}`))].sort().join(",")}`;
