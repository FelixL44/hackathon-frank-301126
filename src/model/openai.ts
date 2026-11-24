// OpenAI and any OpenAI-compatible server (Ollama, LM Studio, vLLM, …) through the openai SDK.
// PDFs travel as their text layer inside the prompt: local servers do not accept PDF files.
import OpenAI from "openai";
import { z } from "zod";
import { base64, ModelRefusal, type ModelAnswer, type ModelProvider, type ModelRequest } from "./provider.ts";

export function openaiProvider(opts: {
  kind: "openai" | "openai-compatible";
  model: string;
  baseURL?: string;
  apiKey?: string;
}): ModelProvider {
  // Local servers ignore the key, but the SDK refuses to start without one.
  const client = new OpenAI({ baseURL: opts.baseURL, apiKey: opts.apiKey ?? (opts.baseURL ? "local" : undefined) });

  return {
    id: `${opts.kind}:${opts.model}`,
    kind: opts.kind,
    async extract(req: ModelRequest, schema: z.ZodType): Promise<ModelAnswer> {
      const content: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: req.text }];
      if (req.image) {
        content.push({ type: "image_url", image_url: { url: `data:${req.image.mediaType};base64,${base64(req.image.data)}` } });
      }
      const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
      const response = await client.chat.completions.create({
        model: opts.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content },
        ],
        response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema: jsonSchema } },
      });
      const choice = response.choices[0];
      if (choice?.message.refusal || choice?.finish_reason === "content_filter") {
        throw new ModelRefusal(`refused: ${choice.message.refusal ?? "content_filter"}`);
      }
      let output: unknown = null; // malformed JSON stays null: invalid output, retried, and its tokens still count
      try {
        output = JSON.parse(choice?.message.content ?? "null");
      } catch {}
      return {
        output,
        model: response.model,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    },
  };
}
