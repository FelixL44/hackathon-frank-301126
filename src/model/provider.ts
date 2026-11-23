// Model provider port (HAC-8). The extractor talks only to this interface; adapters live next to it.
import type { z } from "zod";

export type ModelRequest = {
  system: string;
  text: string;
  image?: { mediaType: string; data: Uint8Array };
  pdf?: Uint8Array; // sent as a document where the provider accepts PDFs; its text layer is always in `text`
};

export type ModelProvider = {
  /** "<provider>:<model>", recorded on every extraction event. */
  id: string;
  /** Returns the model's JSON answer unvalidated; the caller validates it with the same schema. */
  extract(request: ModelRequest, schema: z.ZodType): Promise<unknown>;
};

/** The model declined the request (safety stop). Not retried. */
export class ModelRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusal";
  }
}

export const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
