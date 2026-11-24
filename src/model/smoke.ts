// Live check against the configured model: npm run model:smoke -- fixtures/F3/estimate-1.pdf [more keys…]
// Spends real tokens and is NOT counted in the app's daily budget. Prints grounded observations and cost per file.
import { ExtractionError, modelExtractor } from "../extraction/model-extractor.ts";
import type { NewArtifact } from "../workflow/cases.ts";
import { providerFromEnv } from "./from-env.ts";

const provider = providerFromEnv();
if (!provider) throw new Error("Set MODEL_PROVIDER (and keys) in .env first; see README → Environment variables.");
const extractor = modelExtractor(provider);

const kindOf = (key: string): Pick<NewArtifact, "kind" | "mediaType"> =>
  key.endsWith(".pdf")
    ? { kind: "estimate", mediaType: "application/pdf" }
    : /\.(jpe?g|png|webp)$/i.test(key)
      ? { kind: "photo", mediaType: key.toLowerCase().endsWith(".png") ? "image/png" : key.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg" }
      : { kind: "message", mediaType: "text/plain" };

for (const objectKey of process.argv.slice(2)) {
  const started = Date.now();
  try {
    const { observations, attempts, costEur, model } = await extractor.extract({ sourceId: "smoke", objectKey, ...kindOf(objectKey) });
    console.log(`\n${objectKey} · ${model} · ${attempts} attempt(s) · ${Date.now() - started} ms · ${(costEur ?? 0).toFixed(4)} €`);
    for (const o of observations) {
      const where = o.locator.type === "text" ? `p.${o.locator.page} "${o.locator.quote}"` : o.locator.description;
      console.log(`  ${o.field.padEnd(16)} ${String(o.normalized ?? o.value).padEnd(20)} ${o.readability.padEnd(8)} ${where}`);
    }
  } catch (e) {
    console.log(`\n${objectKey} · FAILED ${e instanceof ExtractionError ? `(${e.category}, ${e.attempts} attempts)` : ""}: ${String(e)}`);
  }
}
