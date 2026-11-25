import { CheckCircle2, Circle, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import Link from "next/link";
import { cases, messages } from "../../db/schema.ts";
import { getDb } from "../../server/db.ts";
import { ActionButton } from "../action-button.tsx";
import { confirmRequestDraft } from "../actions.ts";
import { BrokerShell } from "../broker-shell.tsx";
import { caseHref } from "../case-navigation.ts";
import { fmt, STATUS } from "../status.ts";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  stale_request: "The evidence changed after this draft was written. Open the case and draft it again.",
  request_unavailable: "This case is no longer waiting for a customer request.",
  invalid_request: "The message is empty. Write a message or discard the draft.",
};

// Meta WhatsApp Cloud API settings. Read server-side only; the page shows whether they are set, never their values.
const SETUP = [
  { env: "WHATSAPP_ACCESS_TOKEN", label: "Access token from the Meta Business app" },
  { env: "WHATSAPP_PHONE_NUMBER_ID", label: "Business phone number ID" },
  { env: "WHATSAPP_VERIFY_TOKEN", label: "Webhook verify token" },
] as const;

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { error } = await searchParams;
  const errorMessage = typeof error === "string" && Object.hasOwn(ERRORS, error) ? ERRORS[error] : undefined;
  const steps = SETUP.map((s) => ({ ...s, done: Boolean(process.env[s.env]) }));
  const connected = steps.every((s) => s.done);
  const left = steps.filter((s) => !s.done).length;

  const db = await getDb();
  // Only drafts for the case's current revision can be sent (finishCustomerRequest enforces the same rule).
  const drafts = await db.select({
    id: messages.id, body: messages.body, createdAt: messages.createdAt,
    caseId: cases.id, reference: cases.reference, revision: cases.revision, status: cases.status,
  }).from(messages).innerJoin(cases, eq(cases.id, messages.caseId)).where(and(
    eq(messages.status, "draft"), eq(messages.direction, "outbound"),
    inArray(cases.status, ["broker_review", "awaiting_information"]),
    like(messages.requestKey, sql`concat('broker-draft:', ${cases.revision}, ':%')`),
  )).orderBy(desc(messages.createdAt));
  const sent = await db.select({
    id: messages.id, body: messages.body, createdAt: messages.createdAt, caseId: cases.id, reference: cases.reference,
  }).from(messages).innerJoin(cases, eq(cases.id, messages.caseId))
    .where(and(eq(messages.status, "sent"), eq(messages.direction, "outbound")))
    .orderBy(desc(messages.createdAt)).limit(6);

  return (
    <BrokerShell section="whatsapp">
      <header className="row broker-heading">
        <h1>WhatsApp Business</h1>
        <a className="broker-button" href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">
          Open WhatsApp Business <ExternalLink size={16} aria-hidden="true" />
        </a>
      </header>

      <div className="wa-grid">
        <section className="card wa-card" aria-labelledby="wa-heading">
          <div className="wa-head">
            <span className="wa-logo"><MessageCircle size={24} aria-hidden="true" /></span>
            <div>
              <h2 id="wa-heading">Business account</h2>
              <p className="muted">Customers write to the broker’s WhatsApp number. Each message lands in its case.</p>
            </div>
            <span className={`badge ${connected ? "submitted" : "awaiting_information"}`}>{connected ? "Connected" : "Not connected"}</span>
          </div>
          <dl className="wa-facts">
            <dt>Inbound webhook</dt><dd><code>POST /api/channels/whatsapp/webhook</code></dd>
            <dt>Outbound</dt><dd>Only messages you confirm below. The agent never writes to a customer on its own.</dd>
            <dt>Until connected</dt><dd>Confirmed messages go to the demo inbox and show in the case conversation.</dd>
          </dl>
          <p className="muted">To reply in your own words, open WhatsApp Business and write to the customer directly.</p>
        </section>

        <section className="card wa-card" aria-labelledby="wa-setup">
          <h2 className="steps-title" id="wa-setup">
            {connected ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
            {connected ? "Setup complete" : `${left} ${left === 1 ? "step" : "steps"} left`}
          </h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.env} className={s.done ? "done" : undefined}>
                {s.done ? <CheckCircle2 size={18} aria-label="Done" /> : <Circle size={18} aria-label="Open" />}
                <span>{s.label}<small><code>{s.env}</code></small></span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="wa-grid">
        <section aria-labelledby="wa-drafts">
          <div className="wa-section-title">
            <h2 id="wa-drafts">Ready to send</h2>
            <span className="muted">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</span>
          </div>
          {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}
          {drafts.length ? (
            <ul className="wa-drafts">
              {drafts.map((d) => (
                <li key={d.id} className="wa-draft">
                  <form action={confirmRequestDraft}>
                    <input type="hidden" name="caseId" value={d.caseId} />
                    <input type="hidden" name="revision" value={d.revision} />
                    <input type="hidden" name="draftId" value={d.id} />
                    <input type="hidden" name="returnTo" value="/whatsapp" />
                    <header>
                      <Link href={caseHref(d.caseId, { tab: "messages" })}>{d.reference}</Link>
                      <span className={`badge ${d.status}`}>{STATUS[d.status].label}</span>
                      <span className="ai-tag"><Sparkles size={13} aria-hidden="true" /> Drafted by the agent</span>
                      <time className="muted" dateTime={d.createdAt.toISOString()}>{fmt(d.createdAt)}</time>
                    </header>
                    <label className="muted" htmlFor={`draft-${d.id}`}>Message to customer</label>
                    <textarea id={`draft-${d.id}`} name="body" rows={8} defaultValue={d.body} maxLength={2000} required />
                    <div className="case-actions">
                      <ActionButton name="intent" value="send" pendingLabel="Sending…">Confirm and send</ActionButton>
                      <ActionButton className="secondary" name="intent" value="discard" formNoValidate>Discard</ActionButton>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <div className="card wa-card case-empty">
              <span className="icon-tile"><Sparkles size={21} aria-hidden="true" /></span>
              <strong>No drafts waiting</strong>
              <span className="muted">Open a case, choose a request and the agent drafts the message here.</span>
            </div>
          )}
        </section>

        <section className="card wa-card" aria-labelledby="wa-sent">
          <div className="wa-section-title"><h2 id="wa-sent">Recently sent</h2></div>
          {sent.length ? (
            <ul className="wa-sent">
              {sent.map((m) => (
                <li key={m.id}>
                  <div className="case-meta">
                    <Link href={caseHref(m.caseId, { tab: "messages" })}>{m.reference}</Link>
                    <time className="muted" dateTime={m.createdAt.toISOString()}>{fmt(m.createdAt)}</time>
                  </div>
                  <p>{m.body}</p>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing sent yet.</p>}
        </section>
      </div>
    </BrokerShell>
  );
}
