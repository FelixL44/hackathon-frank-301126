// Claude through the official Anthropic SDK: structured output, PDF as a document block, image as an image block.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { base64, ModelRefusal, type ModelAnswer, type ModelProvider, type ModelRequest } from "./provider.ts";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export function anthropicProvider(model: string): ModelProvider {
  const client = new Anthropic(); // ANTHROPIC_API_KEY or an `ant auth login` profile

  return {
    id: `anthropic:${model}`,
    kind: "anthropic",
    async extract(req: ModelRequest, schema: z.ZodType): Promise<ModelAnswer> {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (req.pdf) {
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64(req.pdf) } });
      }
      if (req.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: req.image.mediaType as ImageMediaType, data: base64(req.image.data) },
        });
      }
      content.push({ type: "text", text: req.text });

      const response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        // A refused request is re-run on a fallback model chosen by refusal category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: req.system,
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") {
        throw new ModelRefusal(`refused: ${response.stop_details?.category ?? "unspecified"}`);
      }
      return {
        output: response.parsed_output,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}
