// Model provider port (HAC-8). The extractor talks only to this interface; adapters live next to it.
import type { z } from "zod";

export type ModelRequest = {
  system: string;
  text: string;
  image?: { mediaType: string; data: Uint8Array };
  pdf?: Uint8Array; // sent as a document where the provider accepts PDFs; its text layer is always in `text`
};

export type ModelAnswer = {
  output: unknown; // the model's JSON answer, unvalidated; the caller validates it with the same schema
  model: string; // the model that actually answered (may differ after a server-side fallback)
  inputTokens: number;
  outputTokens: number;
};

export type ModelProvider = {
  /** "<provider>:<model>" as configured, shown in the UI. */
  id: string;
  kind: "anthropic" | "openai" | "openai-compatible";
  extract(request: ModelRequest, schema: z.ZodType): Promise<ModelAnswer>;
};

/** The model declined the request (safety stop). Not retried. */
export class ModelRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusal";
  }
}

export const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
