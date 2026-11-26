import { ArrowUpRight, FileText, Image, MessageCircle, Paperclip, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import type { ArtifactKind } from "../../domain/schema.ts";
import { getDb } from "../../server/db.ts";
import { whatsappState } from "../../server/settings.ts";
import { caseThread, chatCases } from "../../workflow/messaging.ts";
import { ActionButton } from "../action-button.tsx";
import { BrokerShell } from "../broker-shell.tsx";
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

type SearchParams = Record<string, string | string[] | undefined>;

export default async function WhatsAppInbox({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = await searchParams;
  const db = await getDb();
  const [conversations, whatsapp] = await Promise.all([chatCases(db), whatsappState(db)]);
  const requested = z.uuid().safeParse(search.case).data;
  const selected = conversations.find((row) => row.id === requested) ?? conversations[0] ?? null;
  const thread = selected ? await caseThread(db, selected.id) : [];

  return (
    <BrokerShell queue="whatsapp">
      <header className="row broker-heading">
        <div>
          <h1>WhatsApp Business</h1>
          <p className="muted">One inbox for WhatsApp and the customer website. Messages stay linked to their case.</p>
        </div>
        <div className="case-meta">
          <span className={`badge ${whatsapp.ready ? "submitted" : "sim"}`}>
            <ShieldCheck size={13} aria-hidden="true" /> {whatsapp.ready ? "Credentials saved" : "Web inbox — not connected"}
          </span>
          <Link className="broker-button" href="/admin/integrations">Manage connection <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </header>

      {search.error === "empty" && <p className="notice error" role="alert">Write a message before sending.</p>}

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
                  <Link className="broker-button" href={`/cases/${selected.id}`}>
                    Open case <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
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
                              <a className="chat-file" key={`${message.id}-${file.sourceId}`} href={`/cases/${selected.id}/sources/${file.sourceId}/${file.version}`}>
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

      <p className="muted" style={{ marginTop: 14 }}>
        Replies are stored in the case conversation. Until the WhatsApp Business credentials are active, nothing leaves the web inbox.
      </p>
    </BrokerShell>
  );
}
