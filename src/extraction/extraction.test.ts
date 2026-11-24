import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ModelRefusal, type ModelProvider } from "../model/provider.ts";
import { readObject } from "../storage/objects.ts";
import { directionMismatch, quoteOnPage } from "./grounding.ts";
import { ExtractionError, MAX_ATTEMPTS, modelExtractor, pdfPages } from "./model-extractor.ts";

const message = { sourceId: "message-1", kind: "message" as const, mediaType: "text/plain", objectKey: "fixtures/F1/message-1.txt" };
const estimate = { sourceId: "estimate-1", kind: "estimate" as const, mediaType: "application/pdf", objectKey: "fixtures/F3/estimate-1.pdf" };

const obs = (over: Record<string, unknown> = {}) => ({
  field: "damagedArea",
  value: "para-choques dianteiro",
  normalized: "bumper:front",
  readability: "legible",
  quote: "risquei o para-choques dianteiro",
  page: 1,
  visualDescription: null,
  ...over,
});

/** Replays canned answers as Claude Opus 5.5 with 10k input / 1k output tokens per call, and records the prompts. */
const fakeProvider = (...answers: unknown[]) => {
  const requests: string[] = [];
  const provider: ModelProvider = {
    id: "anthropic:claude-opus-5-5",
    kind: "anthropic",
    async extract(req) {
      requests.push(req.text);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { output: next, model: "claude-opus-5-5", inputTokens: 10_000, outputTokens: 1_000 };
    },
  };
  return { provider, requests };
};

test("quotes match despite case, whitespace and quote style", () => {
  assert.ok(quoteOnPage(["Reparação e   pintura do\npara-choques traseiro"], "pintura do Para-Choques traseiro", 1));
  assert.ok(!quoteOnPage(["só a página 1"], "só a página 1", 2));
});

test("a quote saying rear cannot be normalized to front", () => {
  assert.match(directionMismatch("pintura do para-choques traseiro", "bumper:front")!, /says rear/);
  assert.equal(directionMismatch("para-choques dianteiro e traseiro", "bumper:rear"), null); // either end is named
  assert.equal(directionMismatch("para-choques dianteiro esquerdo", "bumper:front_left"), null);
  assert.equal(directionMismatch("risco no para-choques", "bumper:rear"), null); // no direction word, nothing to check
});

test("generated estimate PDF has the rear-bumper line on page 1 of 2", async () => {
  const pages = await pdfPages(await readObject(estimate.objectKey));
  assert.equal(pages.length, 2);
  assert.ok(quoteOnPage(pages, "pintura do para-choques traseiro", 1));
});

test("grounded output becomes observations with a text locator", async () => {
  const { provider } = fakeProvider({ observations: [obs()] });
  const { observations, attempts } = await modelExtractor(provider).extract(message);
  assert.equal(attempts, 1);
  assert.deepEqual(observations[0]!.locator, { type: "text", quote: "risquei o para-choques dianteiro", page: 1 });
});

test("an invented quote is sent back with the reason and fixed on retry", async () => {
  const { provider, requests } = fakeProvider(
    { observations: [obs({ quote: "para-choques traseiro" })] },
    { observations: [obs()] },
  );
  const { attempts, costEur } = await modelExtractor(provider).extract(message);
  assert.equal(attempts, 2);
  assert.match(requests[1]!, /does not occur on page 1/);
  // both calls count: 2 × (10k × $4 + 1k × $20) / 1M × 0.95 €/$ = 0.114 €
  assert.ok(Math.abs(costEur! - 0.114) < 1e-9, String(costEur));
});

test("a failed extraction still reports what its attempts cost", async () => {
  const bad = { observations: [obs({ quote: null, page: null })] };
  const { provider } = fakeProvider(bad, bad, bad);
  await assert.rejects(modelExtractor(provider).extract(message), (e: unknown) => {
    return e instanceof ExtractionError && Math.abs(e.costEur - 0.171) < 1e-9;
  });
});

test("a missing locator exhausts the budget and fails as invalid_output", async () => {
  const bad = { observations: [obs({ quote: null, page: null })] };
  const { provider } = fakeProvider(bad, bad, bad);
  await assert.rejects(modelExtractor(provider).extract(message), (e: unknown) => {
    return e instanceof ExtractionError && e.category === "invalid_output" && e.attempts === MAX_ATTEMPTS;
  });
});

test("photos need a visual description instead of a quote", async () => {
  const { provider } = fakeProvider({
    observations: [obs({ quote: null, page: null, visualDescription: "deep scratch on the front bumper" })],
  });
  const photo = { sourceId: "photo-1", kind: "photo" as const, mediaType: "image/jpeg", objectKey: "x.jpg" };
  const { observations } = await modelExtractor(provider, async () => new Uint8Array([0xff, 0xd8])).extract(photo);
  assert.deepEqual(observations[0]!.locator, { type: "image", imageId: "photo-1", description: "deep scratch on the front bumper" });
});

test("refusals and missing files are not retried", async () => {
  const { provider } = fakeProvider(new ModelRefusal("refused: cyber"));
  await assert.rejects(modelExtractor(provider).extract(message), (e: unknown) => e instanceof ExtractionError && e.category === "refusal");
  const missing = { ...message, objectKey: "fixtures/none/missing.txt" };
  await assert.rejects(modelExtractor(fakeProvider().provider).extract(missing), (e: unknown) => {
    return e instanceof ExtractionError && e.category === "missing_object";
  });
});

test("object keys cannot escape the storage root", async () => {
  await assert.rejects(readObject("fixtures/../package.json"), /escapes/);
  assert.ok((await readFile("fixtures/files/F1/message-1.txt", "utf8")).includes("dianteiro"));
});
