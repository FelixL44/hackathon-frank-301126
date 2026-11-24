import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSources, conflictKey } from "./compare.ts";

const arts = [
  { sourceId: "message-1", version: 1, kind: "message" },
  { sourceId: "photo-1", version: 1, kind: "photo" },
  { sourceId: "estimate-1", version: 1, kind: "estimate" },
];
let n = 0;
const o = (sourceId: string, field: string, normalized: string, readability = "legible") => ({
  sourceId,
  version: 1,
  field,
  value: normalized,
  normalized,
  readability,
  locator: sourceId === "photo-1"
    ? { type: "image" as const, imageId: sourceId, description: `feature ${++n}` }
    : { type: "text" as const, quote: `quote ${++n}`, page: 1 },
});
const areas = (...list: [string, string][]) => list.map(([s, v]) => o(s, "damagedArea", v));

test("front in the report, rear in the estimate: one conflict citing both sources", () => {
  const [c, ...rest] = compareSources(arts, areas(["message-1", "bumper:front"], ["estimate-1", "bumper:rear"]));
  assert.equal(rest.length, 0);
  assert.equal(c!.field, "damagedArea");
  assert.deepEqual(c!.evidence.map((e) => e.sourceId), ["message-1", "estimate-1"]);
  assert.match(c!.explanation, /message-1 reports bumper:front, but estimate-1 shows bumper:rear/);
});

test("a report with damage at both ends supports an estimate for either end", () => {
  const obs = areas(["message-1", "bumper:front"], ["message-1", "bumper:rear"], ["estimate-1", "bumper:rear"], ["photo-1", "bumper:front"]);
  assert.deepEqual(compareSources(arts, obs), []);
});

test("corners, unknown angles and unreadable areas do not raise conflicts", () => {
  assert.deepEqual(compareSources(arts, areas(["message-1", "bumper:front"], ["photo-1", "fender:front_left"])), []);
  assert.deepEqual(compareSources(arts, areas(["message-1", "bumper:front"], ["photo-1", "bumper:unknown"])), []);
  const blurry = [o("message-1", "damagedArea", "bumper:front"), o("photo-1", "damagedArea", "bumper:rear", "illegible")];
  assert.deepEqual(compareSources(arts, blurry), []);
});

test("without areas in the report, the photo is the reference", () => {
  const [c] = compareSources(arts, areas(["photo-1", "bumper:front"], ["estimate-1", "bumper:rear"]));
  assert.deepEqual(c!.evidence.map((e) => e.sourceId), ["photo-1", "estimate-1"]);
});

test("plates compare without case and separators; different plates or dates conflict", () => {
  assert.deepEqual(compareSources(arts, [o("message-1", "vehicleId", "AA-12-BC"), o("estimate-1", "vehicleId", "aa 12bc")]), []);
  const [plate] = compareSources(arts, [o("message-1", "vehicleId", "AA-12-BC"), o("estimate-1", "vehicleId", "AA-12-BD")]);
  assert.equal(plate!.field, "vehicleId");
  const [date] = compareSources(arts, [o("message-1", "incidentDate", "2026-11-18"), o("estimate-1", "incidentDate", "2026-11-19")]);
  assert.equal(date!.field, "incidentDate");
});

test("a superseded estimate version no longer counts", () => {
  const corrected = [...arts, { sourceId: "estimate-1", version: 2, kind: "estimate" }];
  const obs = [...areas(["message-1", "bumper:front"], ["estimate-1", "bumper:rear"]), { ...o("estimate-1", "damagedArea", "bumper:front"), version: 2 }];
  assert.deepEqual(compareSources(corrected, obs), []);
});

test("conflict key changes when a cited source gets a new version", () => {
  const ref = (version: number) => ({ sourceId: "estimate-1", version, locator: { type: "text" as const, quote: "q", page: 1 } });
  assert.notEqual(conflictKey("damagedArea", [ref(1)]), conflictKey("damagedArea", [ref(2)]));
});
