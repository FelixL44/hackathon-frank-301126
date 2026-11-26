// Integration settings edited in the admin view. Values live in the database and fall back to env vars,
// so a deployment can be configured either way. Secrets are only ever rendered masked.
import { count, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { agents, cases, customers, messages, settings } from "../db/schema.ts";

export type FieldKind = "text" | "secret" | "select";
export type IntegrationField = {
  key: string;
  env: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
};
export type IntegrationGroup = { id: string; title: string; description: string; fields: IntegrationField[] };

export const INTEGRATIONS: IntegrationGroup[] = [
  {
    id: "model",
    title: "Model provider",
    description:
      "The extraction model. Saved here, the app uses these values before the server environment, so a key pasted in the admin view takes effect on the next case.",
    fields: [
      {
        key: "model_provider",
        env: "MODEL_PROVIDER",
        label: "Provider",
        kind: "select",
        options: [
          { value: "", label: "Fixture data (no model)" },
          { value: "anthropic", label: "Anthropic (Claude)" },
          { value: "openai", label: "OpenAI" },
          { value: "openai-compatible", label: "OpenAI-compatible (Ollama, vLLM, …)" },
        ],
        hint: "Without a provider the app runs on the fixtures’ pre-extracted observations.",
      },
      { key: "model_id", env: "MODEL_ID", label: "Model ID", kind: "text", placeholder: "claude-opus-5-5" },
      { key: "anthropic_api_key", env: "ANTHROPIC_API_KEY", label: "Anthropic API key", kind: "secret", placeholder: "sk-ant-…" },
      { key: "openai_api_key", env: "OPENAI_API_KEY", label: "OpenAI API key", kind: "secret", placeholder: "sk-…" },
      {
        key: "model_base_url",
        env: "MODEL_BASE_URL",
        label: "OpenAI-compatible base URL",
        kind: "text",
        placeholder: "http://localhost:11434/v1",
      },
      {
        key: "model_price_usd_per_mtok",
        env: "MODEL_PRICE_USD_PER_MTOK",
        label: "OpenAI price (input,output USD per Mtok)",
        kind: "text",
        placeholder: "2.5,10",
      },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp Business",
    description:
      "Meta Cloud API credentials. Until they are set, confirmed broker messages stay in the web inbox; the customer website always works.",
    fields: [
      { key: "whatsapp_access_token", env: "WHATSAPP_ACCESS_TOKEN", label: "Access token", kind: "secret", placeholder: "EAA…" },
      { key: "whatsapp_phone_number_id", env: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID", kind: "text" },
      { key: "whatsapp_verify_token", env: "WHATSAPP_VERIFY_TOKEN", label: "Webhook verify token", kind: "secret" },
      { key: "whatsapp_business_name", env: "WHATSAPP_BUSINESS_NAME", label: "Business display name", kind: "text", placeholder: "FRANK Broker" },
      { key: "whatsapp_number", env: "WHATSAPP_NUMBER", label: "Public number shown to customers", kind: "text", placeholder: "+351 …" },
    ],
  },
  {
    id: "telegram",
    title: "Telegram fallback",
    description: "Optional fallback channel if the WhatsApp Business account is not available in time.",
    fields: [
      { key: "telegram_bot_token", env: "TELEGRAM_BOT_TOKEN", label: "Bot token", kind: "secret", placeholder: "123456:ABC…" },
      { key: "telegram_bot_name", env: "TELEGRAM_BOT_NAME", label: "Bot username", kind: "text", placeholder: "@frank_claims_bot" },
    ],
  },
];

export const ALL_FIELDS: IntegrationField[] = INTEGRATIONS.flatMap((group) => group.fields);

export type SettingRow = { key: string; value: string; isSecret: boolean; updatedAt: Date };

export async function settingRows(db: Db): Promise<Map<string, SettingRow>> {
  const rows = await db.select().from(settings);
  return new Map(rows.map((row) => [row.key, row]));
}

/** Mask a secret for display: only the last four characters survive. */
export function maskSecret(value: string): string {
  if (!value) return "";
  return value.length <= 4 ? "••••" : `••••••••${value.slice(-4)}`;
}

export type FieldState = IntegrationField & {
  source: "database" | "environment" | null;
  display: string;
  configured: boolean;
};

/** What the admin overview shows per field. Never returns a secret in full. */
export async function integrationState(db: Db, env: Record<string, string | undefined> = process.env) {
  const rows = await settingRows(db);
  return INTEGRATIONS.map((group) => {
    const fields: FieldState[] = group.fields.map((field) => {
      const stored = rows.get(field.key)?.value ?? "";
      const fromEnv = env[field.env] ?? "";
      const value = stored || fromEnv;
      const source = stored ? "database" : fromEnv ? "environment" : null;
      return {
        ...field,
        source,
        configured: Boolean(value),
        display: field.kind === "secret" ? maskSecret(value) : value,
      };
    });
    return { ...group, fields, configured: fields.filter((field) => field.configured).length };
  });
}

/** Env-like config with database values taking precedence. Feeds providerFromEnv and the WhatsApp header. */
export async function configFromSettings(db: Db, env: Record<string, string | undefined> = process.env) {
  const rows = await settingRows(db);
  const merged: Record<string, string | undefined> = { ...env };
  for (const field of ALL_FIELDS) {
    const value = rows.get(field.key)?.value ?? "";
    if (value) merged[field.env] = value;
  }
  return merged;
}

export async function settingValue(db: Db, key: string, env: Record<string, string | undefined> = process.env) {
  return (await configFromSettings(db, env))[ALL_FIELDS.find((field) => field.key === key)?.env ?? key];
}

export async function writeSetting(db: Db, key: string, value: string, isSecret: boolean) {
  await db
    .insert(settings)
    .values({ key, value, isSecret, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, isSecret, updatedAt: new Date() } });
}

/** Empty secret input keeps the stored value; the `clear:<key>` checkbox removes it.
 *  Fields absent from this form (other integration groups) are left untouched. */
export async function saveIntegrationFields(db: Db, form: FormData) {
  for (const field of ALL_FIELDS) {
    const clear = form.has(`clear:${field.key}`);
    if (!form.has(field.key) && !clear) continue;
    if (field.kind === "secret") {
      if (clear) {
        await writeSetting(db, field.key, "", true);
        continue;
      }
      const value = String(form.get(field.key) ?? "").trim();
      if (value) await writeSetting(db, field.key, value, true);
      continue;
    }
    const value = String(form.get(field.key) ?? "").trim();
    await writeSetting(db, field.key, value, false);
  }
}

export async function whatsappState(db: Db, env: Record<string, string | undefined> = process.env) {
  const config = await configFromSettings(db, env);
  const ready = Boolean(config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID);
  return {
    ready,
    number: config.WHATSAPP_NUMBER ?? "",
    businessName: config.WHATSAPP_BUSINESS_NAME ?? "FRANK Broker",
    phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID ?? "",
  };
}

/** Removes one key; used by “reset to environment”. */
export async function deleteSetting(db: Db, key: string) {
  await db.delete(settings).where(eq(settings.key, key));
}

/** Counts for the admin dashboard. */
export async function adminCounts(db: Db) {
  const [[caseCount], [submittedCount], [customerCount], [agentCount], [messageCount]] = await Promise.all([
    db.select({ n: count() }).from(cases),
    db.select({ n: count() }).from(cases).where(eq(cases.status, "submitted")),
    db.select({ n: count() }).from(customers),
    db.select({ n: count() }).from(agents).where(eq(agents.status, "active")),
    db.select({ n: count() }).from(messages),
  ]);
  return {
    cases: caseCount?.n ?? 0,
    submitted: submittedCount?.n ?? 0,
    customers: customerCount?.n ?? 0,
    agents: agentCount?.n ?? 0,
    messages: messageCount?.n ?? 0,
  };
}
