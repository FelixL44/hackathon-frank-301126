// Completeness check and filing preparation. Pure: the workflow passes in stored rows, gets back gaps or a filing.
import { ClaimFiling, PARKING_DAMAGE_REQUIRED_KINDS, RequiredField, type FindingRule } from "./schema.ts";

type ArtifactLike = { sourceId: string; version: number; kind: string };
type ObservationLike = {
  sourceId: string;
  version: number;
  field: string;
  value: string | null;
  normalized: string | null;
  readability: string;
};
export type Gap = { rule: FindingRule; field: RequiredField | null; explanation: string };

/** Latest version of each source. Superseded versions stay stored but no longer count. */
export const currentArtifacts = <A extends ArtifactLike>(all: readonly A[]) =>
  all.filter((a) => !all.some((b) => b.sourceId === a.sourceId && b.version > a.version));

const usable = (o: ObservationLike) =>
  o.readability === "legible" &&
  (o.normalized ?? o.value) !== null &&
  !(o.field === "damagedArea" && o.normalized?.endsWith(":unknown")); // unclear viewing angle counts as unknown

const EXTRACTED_FIELDS = RequiredField.exclude(["caseReference"]).options;

export function prepareFiling(
  c: { reference: string; revision: number },
  allArtifacts: readonly ArtifactLike[],
  allObservations: readonly ObservationLike[],
): { filing: ClaimFiling | null; gaps: Gap[] } {
  const current = currentArtifacts(allArtifacts);
  const obs = allObservations.filter((o) => current.some((a) => a.sourceId === o.sourceId && a.version === o.version));
  const ok = (field: string) => obs.filter((o) => o.field === field && usable(o));

  const gaps: Gap[] = [];
  for (const kind of PARKING_DAMAGE_REQUIRED_KINDS) {
    if (!current.some((a) => a.kind === kind)) gaps.push({ rule: "missing", field: null, explanation: `No ${kind} received.` });
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
