// Completeness check and filing preparation. Pure: the workflow passes in stored rows, gets back gaps or a filing.
import { ClaimFiling, PARKING_DAMAGE_REQUIRED_KINDS, RequiredField, type FindingRule } from "./schema.ts";

export type ArtifactLike = { sourceId: string; version: number; kind: string };
export type ObservationLike = {
  sourceId: string;
  version: number;
  field: string;
  value: string | null;
  normalized: string | null;
  readability: string;
};
export type Gap = {
  rule: FindingRule;
  field: RequiredField | null;
  explanation: string;
  document?: "photo" | "estimate"; // set when a whole required document is missing
};

/** Latest version of each source. Superseded versions stay stored but no longer count. */
export const currentArtifacts = <A extends ArtifactLike>(all: readonly A[]) =>
  all.filter((a) => !all.some((b) => b.sourceId === a.sourceId && b.version > a.version));

const usable = (o: ObservationLike) =>
  o.readability === "legible" &&
  (o.normalized ?? o.value) !== null &&
  !(o.field === "damagedArea" && o.normalized?.endsWith(":unknown")); // unclear viewing angle counts as unknown

const EXTRACTED_FIELDS = RequiredField.exclude(["caseReference"]).options;

const ofCurrent = <O extends ObservationLike>(artifacts: readonly ArtifactLike[], obs: readonly O[]) => {
  const current = currentArtifacts(artifacts);
  return obs.filter((o) => current.some((a) => a.sourceId === o.sourceId && a.version === o.version));
};

/** Observations that can support a filing or a comparison: from a current version, legible, with a value. */
export const usableCurrent = <O extends ObservationLike>(artifacts: readonly ArtifactLike[], obs: readonly O[]) =>
  ofCurrent(artifacts, obs).filter(usable);

/** `accepted` holds the broker's resolution per field: only that source's values go into the filing. */
export function prepareFiling(
  c: { reference: string; revision: number },
  allArtifacts: readonly ArtifactLike[],
  allObservations: readonly ObservationLike[],
  accepted: Partial<Record<RequiredField, string>> = {},
): { filing: ClaimFiling | null; gaps: Gap[] } {
  const current = currentArtifacts(allArtifacts);
  const obs = ofCurrent(allArtifacts, allObservations);
  const ok = (field: string) =>
    obs.filter((o) => o.field === field && usable(o) && (accepted[field as RequiredField] ?? o.sourceId) === o.sourceId);

  const gaps: Gap[] = [];
  for (const kind of PARKING_DAMAGE_REQUIRED_KINDS) {
    if (!current.some((a) => a.kind === kind)) gaps.push({ rule: "missing", field: null, explanation: `No ${kind} received.`, document: kind });
  }
  for (const field of EXTRACTED_FIELDS) {
    if (ok(field).length) continue;
    const seen = obs.filter((o) => o.field === field);
    const rule: FindingRule =
      seen.length === 0 ? "missing" : seen.some((o) => o.readability === "illegible") ? "illegible" : "ambiguous";
    gaps.push({ rule, field, explanation: `${field}: ${rule} in all current sources.` });
  }
  if (gaps.length) return { filing: null, gaps };

  const value = (field: string) => ok(field)[0]!.normalized ?? ok(field)[0]!.value!;
  const parsed = ClaimFiling.safeParse({
    caseReference: c.reference,
    revision: c.revision,
    policyReference: value("policyReference"),
    vehicleId: value("vehicleId"),
    incidentDate: value("incidentDate"),
    eventDescription: value("eventDescription"),
    damagedArea: [...new Set(ok("damagedArea").map((o) => o.normalized ?? o.value!))],
    evidence: current.map((a) => ({ sourceId: a.sourceId, version: a.version })),
  });
  if (parsed.success) return { filing: parsed.data, gaps };
  return {
    filing: null,
    gaps: parsed.error.issues.map((i) => ({
      rule: "ambiguous" as const,
      field: RequiredField.safeParse(i.path[0]).data ?? null,
      explanation: `${String(i.path[0])}: ${i.message}`,
    })),
  };
}
