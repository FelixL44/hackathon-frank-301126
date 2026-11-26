import { KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { ActionButton } from "../../../action-button.tsx";
import { getDb } from "../../../../server/db.ts";
import { integrationState, settingRows } from "../../../../server/settings.ts";
import { saveIntegrations } from "../../actions.ts";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminIntegrations({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { saved, error } = await searchParams;
  const db = await getDb();
  const [groups, stored] = await Promise.all([integrationState(db), settingRows(db)]);

  return (
    <>
      <header className="row broker-heading">
        <div>
          <h1>Integrations</h1>
          <p className="muted">Model provider, WhatsApp Business and the Telegram fallback.</p>
        </div>
        <span className="badge sim">Demo settings</span>
      </header>

      {saved === "1" && (
        <p className="notice ok" role="status">
          <ShieldCheck size={15} aria-hidden="true" /> Integration settings saved.
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          The settings could not be saved. Check the values and try again.
        </p>
      )}

      <p className="notice sim" role="note">
        Model values saved here are used on the next case: the database wins over the server environment.
        Secrets are stored server-side and only shown masked.
      </p>

      <div className="admin-integrations">
        {groups.map((group) => (
          <form className="card" id={`integration-${group.id}`} action={saveIntegrations} key={group.id}>
            {/* Other groups' non-secret values travel along so saving this form never clears them. */}
            {groups
              .filter((other) => other.id !== group.id)
              .flatMap((other) => other.fields)
              .filter((field) => field.kind !== "secret")
              .map((field) => (
                <input key={field.key} type="hidden" name={field.key} value={stored.get(field.key)?.value ?? ""} />
              ))}

            <header className="admin-section-head">
              <div>
                <h2>{group.title}</h2>
                <p className="muted">{group.description}</p>
              </div>
              <span className="badge">{group.configured}/{group.fields.length} set</span>
            </header>

            <div className="admin-form-grid">
              {group.fields.map((field) => {
                const sourceLabel = field.source === "database" ? "Database" : field.source === "environment" ? "Environment" : "Not set";
                const sourceTitle = field.source === "database"
                  ? "Current value comes from the database."
                  : field.source === "environment"
                    ? "Current value comes from the server environment. Saving here overrides it."
                    : "No value configured.";
                const id = `setting-${field.key}`;
                return (
                  <div className="admin-field" key={field.key}>
                    <label className="admin-field-label" htmlFor={id}>{field.label}</label>
                    <span className="admin-field-meta">
                      <code>{field.env}</code>
                      <span className={`admin-source ${field.source ?? "unset"}`} title={sourceTitle}>{sourceLabel}</span>
                    </span>

                    {field.kind === "select" ? (
                      <select className="admin-input" id={id} name={field.key} defaultValue={field.display}>
                        {field.options?.map((option) => (
                          <option key={option.value || "none"} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="admin-input"
                        id={id}
                        name={field.key}
                        type={field.kind === "secret" ? "password" : "text"}
                        defaultValue={field.kind === "secret" ? undefined : field.display}
                        placeholder={field.kind === "secret" && field.configured ? "Leave empty to keep the stored value" : field.placeholder}
                        autoComplete="off"
                      />
                    )}

                    {field.hint && <small>{field.hint}</small>}

                    {field.kind === "secret" && (
                      <span className="admin-secret-note">
                        {field.configured ? <>Current: <code>{field.display}</code></> : "No value configured."}
                        {field.source === "environment" && " From the environment; saving a value here overrides it."}
                      </span>
                    )}

                    {field.kind === "secret" && field.source === "database" && (
                      <label className="admin-check" htmlFor={`clear-${field.key}`}>
                        <input id={`clear-${field.key}`} type="checkbox" name={`clear:${field.key}`} /> Clear stored value
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="admin-form-actions">
              <ActionButton pendingLabel="Saving…">Save settings</ActionButton>
              <span className="muted">Empty secret fields keep the stored value.</span>
            </div>
          </form>
        ))}
      </div>

      <p className="muted admin-footnote">
        <KeyRound size={14} aria-hidden="true" /> Values from the environment are read-only here; save the field with a new
        value to move it into the database, or clear a stored secret to fall back to the environment.
      </p>
      <p className="muted admin-footnote">
        <PlugZap size={14} aria-hidden="true" /> WhatsApp messages leave only after the broker approves them. Without
        credentials, every message stays in the web inbox.
      </p>
    </>
  );
}
