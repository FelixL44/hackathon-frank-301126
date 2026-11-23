// Model-backed extractor: read the evidence, ask the model, keep only grounded observations, retry within budget.
import { extractText } from "unpdf";
import { ModelRefusal, type ModelProvider } from "../model/provider.ts";
import { readObject } from "../storage/objects.ts";
import type { Extractor, NewArtifact } from "../workflow/cases.ts";
import { groundObservations } from "./grounding.ts";
import { ModelOutput, PROMPT_VERSION, SYSTEM_PROMPT, userPrompt } from "./prompt.ts";

export const MAX_ATTEMPTS = 3;

export type ExtractionFailure = "missing_object" | "invalid_output" | "refusal" | "provider_error";

/** Extraction gave up. The workflow turns this into an `invalid_extraction` finding for the broker. */
export class ExtractionError extends Error {
  readonly category: ExtractionFailure;
  readonly attempts: number;
  constructor(category: ExtractionFailure, message: string, attempts: number) {
    super(message);
    this.name = "ExtractionError";
    this.category = category;
    this.attempts = attempts;
  }
}

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  return (await extractText(bytes.slice(), { mergePages: false })).text; // pdf.js detaches the buffer it gets
}

async function textPages(artifact: NewArtifact, bytes: Uint8Array): Promise<string[] | null> {
  if (artifact.kind === "photo") return null;
  return artifact.mediaType === "application/pdf" ? pdfPages(bytes) : [new TextDecoder().decode(bytes)];
}

export function modelExtractor(provider: ModelProvider, read: (key: string) => Promise<Uint8Array> = readObject): Extractor {
  return {
    name: provider.id,
    promptVersion: PROMPT_VERSION,
    async extract(artifact) {
      let bytes: Uint8Array;
      try {
        bytes = await read(artifact.objectKey);
      } catch {
        throw new ExtractionError("missing_object", `evidence file ${artifact.objectKey} is not available`, 0);
      }
      const pages = await textPages(artifact, bytes);
      const request = {
        system: SYSTEM_PROMPT,
        text: userPrompt(artifact, pages),
        image: artifact.kind === "photo" ? { mediaType: artifact.mediaType, data: bytes } : undefined,
        pdf: artifact.mediaType === "application/pdf" ? bytes : undefined,
      };

      let errors: string[] = [];
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const feedback = errors.length
          ? `\n\nYour previous answer was rejected:\n- ${errors.join("\n- ")}\nReturn the complete corrected JSON.`
          : "";
        let raw: unknown = null;
        try {
          raw = await provider.extract({ ...request, text: request.text + feedback }, ModelOutput);
        } catch (e) {
          if (e instanceof ModelRefusal) throw new ExtractionError("refusal", e.message, attempt);
          // Malformed JSON is invalid output (retried below); anything else already went through the SDK's own retries.
          if (!(e instanceof SyntaxError)) {
            throw new ExtractionError("provider_error", e instanceof Error ? e.message : String(e), attempt);
          }
        }
        const grounded = groundObservations(artifact, pages, raw);
        if (grounded.ok) return { observations: grounded.observations, attempts: attempt };
        errors = grounded.errors;
      }
      throw new ExtractionError("invalid_output", errors.join("; "), MAX_ATTEMPTS);
    },
  };
}
