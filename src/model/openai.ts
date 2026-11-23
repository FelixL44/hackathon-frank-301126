// OpenAI and any OpenAI-compatible server (Ollama, LM Studio, vLLM, …) through the openai SDK.
// PDFs travel as their text layer inside the prompt: local servers do not accept PDF files.
import OpenAI from "openai";
import { z } from "zod";
import { base64, ModelRefusal, type ModelProvider, type ModelRequest } from "./provider.ts";

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
    async extract(req: ModelRequest, schema: z.ZodType) {
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
      return JSON.parse(choice?.message.content ?? "null"); // a SyntaxError counts as invalid output and is retried
    },
  };
}
