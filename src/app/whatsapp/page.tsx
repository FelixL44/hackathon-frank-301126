import { CheckCircle2, Circle, ExternalLink, FileText, Image, MessageCircle, Paperclip, ShieldCheck, Sparkles } from "lucide-react";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import Link from "next/link";
import { z } from "zod";
import type { ArtifactKind } from "../../domain/schema.ts";
import { cases, messages } from "../../db/schema.ts";
import { getDb } from "../../server/db.ts";
import { integrationState, whatsappState } from "../../server/settings.ts";
import { caseThread, chatCases } from "../../workflow/messaging.ts";
import { ActionButton } from "../action-button.tsx";
import { confirmRequestDraft } from "../actions.ts";
import { BrokerShell } from "../broker-shell.tsx";
import { caseHref } from "../case-navigation.ts";
import { fmt, STATUS } from "../status.ts";
import { sendChatMessage } from "./actions.ts";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  web: "Website",
  demo: "Demo inbox",
  teams: "Teams",
  telegram: "Telegram",
};

const FILE_ICON: Record<ArtifactKind, typeof FileText> = { message: MessageCircle, photo: Image, estimate: FileText };

const ERRORS: Record<string, string> = {
  empty: "Write a message before sending.",
  stale_request: "The evidence changed after this draft was written. Open the case and draft it again.",
  request_unavailable: "This case is no longer waiting for a customer request.",
  invalid_request: "The message is empty. Write a message or discard the draft.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WhatsAppInbox({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = await searchParams;
  const errorMessage = typeof search.error === "string" && Object.hasOwn(ERRORS, search.error) ? ERRORS[search.error] : undefined;
  const db = await getDb();
  const [conversations, whatsapp, groups] = await Promise.all([chatCases(db), whatsappState(db), integrationState(db)]);
  const setup = groups.find((group) => group.id === "whatsapp")!;
  const connected = setup.fields.every((field) => field.configured);

  // Only drafts for the case's current revision can be sent (finishCustomerRequest enforces the same rule).
  const drafts = await db.select({
    id: messages.id, body: messages.body, createdAt: messages.createdAt,
    caseId: cases.id, reference: cases.reference, revision: cases.revision, status: cases.status,
  }).from(messages).innerJoin(cases, eq(cases.id, messages.caseId)).where(and(
    eq(messages.status, "draft"), eq(messages.direction, "outbound"),
    inArray(cases.status, ["broker_review", "awaiting_information"]),
    like(messages.requestKey, sql`concat('broker-draft:', ${cases.revision}, ':%')`),
  )).orderBy(desc(messages.createdAt));

  const requested = z.uuid().safeParse(search.case).data;
  const selected = conversations.find((row) => row.id === requested) ?? conversations[0] ?? null;
  const thread = selected ? await caseThread(db, selected.id) : [];

  return (
    <BrokerShell section="whatsapp">
      <header className="row broker-heading">
        <div>
          <h1>WhatsApp Business</h1>
          <p className="muted">One inbox for WhatsApp and the customer website. Messages stay linked to their case.</p>
        </div>
        <div className="case-meta">
          <span className={`badge ${whatsapp.ready ? "submitted" : "sim"}`}>
            <ShieldCheck size={13} aria-hidden="true" /> {whatsapp.ready ? "Credentials saved" : "Web inbox — not connected"}
          </span>
          <Link className="broker-button" href="/admin/integrations">Manage connection</Link>
          <a className="broker-button" href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">
            Open WhatsApp Business <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
      </header>

      {errorMessage && <p className="notice error" role="alert">{errorMessage}</p>}

      {drafts.length > 0 && (
        <section className="card wa-card" aria-labelledby="wa-drafts">
          <div className="wa-section-title">
            <h2 id="wa-drafts">Ready to send</h2>
            <span className="muted">{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</span>
          </div>
          <ul className="wa-drafts">
            {drafts.map((draft) => (
              <li key={draft.id} className="wa-draft">
                <form action={confirmRequestDraft}>
                  <input type="hidden" name="caseId" value={draft.caseId} />
                  <input type="hidden" name="revision" value={draft.revision} />
                  <input type="hidden" name="draftId" value={draft.id} />
                  <input type="hidden" name="returnTo" value="/whatsapp" />
                  <header>
                    <Link href={caseHref(draft.caseId, { tab: "messages" })}>{draft.reference}</Link>
                    <span className={`badge ${draft.status}`}>{STATUS[draft.status].label}</span>
                    <span className="ai-tag"><Sparkles size={13} aria-hidden="true" /> Drafted by the agent</span>
                    <time className="muted" dateTime={draft.createdAt.toISOString()}>{fmt(draft.createdAt)}</time>
                  </header>
                  <label className="muted" htmlFor={`draft-${draft.id}`}>Message to customer</label>
                  <textarea id={`draft-${draft.id}`} name="body" rows={6} defaultValue={draft.body} maxLength={2000} required />
                  <div className="case-actions">
                    <ActionButton name="intent" value="send" pendingLabel="Sending…">Confirm and send</ActionButton>
                    <ActionButton className="secondary" name="intent" value="discard" formNoValidate>Discard</ActionButton>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!conversations.length ? (
        <section className="card case-empty">
          <span className="icon-tile"><MessageCircle size={22} aria-hidden="true" /></span>
          <strong>No conversations yet</strong>
          <span className="muted">Open a demo case or send the customer website’s first message.</span>
          <Link className="broker-button" href="/">Go to claims</Link>
        </section>
      ) : (
        <div className="chat-layout">
          <aside className="chat-list" aria-label="Conversations">
            <div className="chat-list-head">
              <h2>Conversations</h2>
              <span className="badge">{conversations.length}</span>
            </div>
            <div className="chat-list-scroll">
              {conversations.map((row) => (
                <Link
                  key={row.id}
                  className="chat-list-item"
                  href={`/whatsapp?case=${row.id}`}
                  aria-current={row.id === selected?.id ? "page" : undefined}
                >
                  <div className="chat-list-meta">
                    <strong>{row.customerName ?? "Unknown customer"}</strong>
                    <span className={`badge ${row.status}`}>{STATUS[row.status].label}</span>
                  </div>
                  <small>{row.lastMessage ?? "No messages yet"}</small>
                  <small>
                    {row.reference} · {CHANNEL_LABEL[row.customerChannel ?? "web"] ?? row.customerChannel}
                  </small>
                </Link>
              ))}
            </div>
          </aside>

          {selected && (
            <section className="chat-panel" aria-label={`Conversation ${selected.reference}`}>
              <header className="chat-head">
                <div>
                  <h2>
                    <MessageCircle size={18} aria-hidden="true" /> {selected.customerName ?? "Unknown customer"}
                  </h2>
                  <small>
                    {selected.customerAddress ?? "No address"} · {CHANNEL_LABEL[selected.customerChannel ?? "web"] ?? selected.customerChannel}
                  </small>
                </div>
                <div className="case-meta">
                  <span className={`badge ${selected.status}`}>{STATUS[selected.status].label}</span>
                  <Link className="broker-button" href={`/cases/${selected.id}`}>Open case</Link>
                </div>
              </header>

              <div className="chat-thread">
                {thread.length ? thread.map((message) => {
                  const outbound = message.direction === "outbound";
                  return (
                    <article key={message.id} className={`chat-bubble${outbound ? " outbound" : ""}`}>
                      <div className="chat-meta">
                        <strong>{outbound ? "Broker" : selected.customerName ?? "Customer"}</strong>
                        <span>{CHANNEL_LABEL[message.channel] ?? message.channel}</span>
                        {message.status === "received" && <span>· new</span>}
                        <time dateTime={message.createdAt.toISOString()}>{fmt(message.createdAt)}</time>
                      </div>
                      {message.body && <p>{message.body}</p>}
                      {message.attachments.length > 0 && (
                        <div className="chat-attachments">
                          {message.attachments.map((file) => {
                            const Icon = FILE_ICON[file.kind] ?? Paperclip;
                            return (
                              <a className="chat-file" key={`${message.id}-${file.sourceId}-${file.version}`} href={`/cases/${selected.id}/sources/${file.sourceId}/${file.version}`}>
                                <Icon size={13} aria-hidden="true" /> <span>{file.name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                }) : (
                  <p className="chat-empty">No messages yet. Write the first reply — it is saved on the case.</p>
                )}
              </div>

              <form className="chat-composer" action={sendChatMessage}>
                <input type="hidden" name="caseId" value={selected.id} />
                <textarea name="body" rows={2} maxLength={4000} required placeholder="Write a message…" aria-label="Message to customer" />
                <ActionButton pendingLabel="Sending…">Send</ActionButton>
              </form>
            </section>
          )}
        </div>
      )}

      <details className="card wa-card wa-setup-details">
        <summary>
          {connected ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
          Connection &amp; setup
          <span className={`badge ${connected ? "submitted" : "sim"}`}>{connected ? "All credentials set" : `${setup.fields.filter((field) => !field.configured).length} missing`}</span>
        </summary>
        <dl className="wa-facts">
          <dt>Business account</dt><dd>{whatsapp.businessName}</dd>
          <dt>Public number</dt><dd>{whatsapp.number || "Not set"}</dd>
          <dt>Inbound webhook</dt><dd><code>POST /api/channels/whatsapp/webhook</code></dd>
          <dt>Outbound</dt><dd>Only messages you write or confirm below. The agent never writes to a customer on its own.</dd>
          <dt>Until connected</dt><dd>Messages stay in this web inbox and in the case conversation.</dd>
        </dl>
        <ol className="steps">
          {setup.fields.map((field) => (
            <li key={field.key} className={field.configured ? "done" : undefined}>
              {field.configured ? <CheckCircle2 size={18} aria-label="Done" /> : <Circle size={18} aria-label="Open" />}
              <span>{field.label}<small><code>{field.env}</code></small></span>
            </li>
          ))}
        </ol>
        <p className="muted">
          Save credentials in <Link href="/admin/integrations">Admin → Integrations</Link>.
        </p>
      </details>
    </BrokerShell>
  );
}
