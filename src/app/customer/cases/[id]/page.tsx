import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, FileText, Image, MessageCircle, Paperclip, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { findings } from "../../../../db/schema.ts";
import { currentCustomer } from "../../../../server/customer-session.ts";
import { getDb } from "../../../../server/db.ts";
import { ACCEPTED_UPLOADS, MAX_UPLOADS, MAX_UPLOAD_BYTES, customerCase } from "../../../../workflow/customer-intake.ts";
import { caseThread } from "../../../../workflow/messaging.ts";
import { ActionButton } from "../../../action-button.tsx";
import { fmt, STATUS } from "../../../status.ts";
import { postMessage, signOut } from "../../actions.ts";
import { errorText } from "../../errors.ts";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  web: "Website",
  demo: "Demo inbox",
  teams: "Teams",
  telegram: "Telegram",
};

const FILE_ICON = { message: MessageCircle, photo: Image, estimate: FileText } as const;

const FINDING_LABEL: Record<string, string> = {
  conflict: "Two documents disagree",
  missing: "Something is missing",
  illegible: "Something is hard to read",
  ambiguous: "A detail is unclear",
  invalid_extraction: "A document could not be read",
};

const NEED_DETAIL: Record<keyof typeof STATUS, string> = {
  intake: "We are reading your documents. Our broker looks at the file next.",
  awaiting_information: "Our broker needs a little more before the file can move on.",
  broker_review: "Our broker is checking the evidence against your policy details.",
  awaiting_approval: "Your file is complete. The broker is preparing to forward it to the insurer.",
  submitting: "The claim is on its way to the insurer. This page updates when it is accepted.",
  submitted: "The claim was forwarded. Our broker will contact you if the insurer needs anything.",
};

const MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const notice = errorText(search.error);
  const uploaded = search.uploaded === "1";

  const db = await getDb();
  const customer = await currentCustomer(db);
  if (!customer) redirect("/customer?error=session");

  // Ownership comes from the session, never from the URL.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  const claim = await customerCase(db, customer.id, parsedId.data);
  if (!claim) notFound();

  const [thread, openFindings] = await Promise.all([
    caseThread(db, claim.id),
    db
      .select()
      .from(findings)
      .where(and(eq(findings.caseId, claim.id), eq(findings.status, "open")))
      .orderBy(asc(findings.createdAt)),
  ]);

  const need =
    claim.status === "awaiting_information"
      ? openFindings.length
        ? "Our broker needs something from you. The points below say what would help."
        : "Our broker is waiting for your reply. Write in the chat below."
      : NEED_DETAIL[claim.status];

  return (
    <>
      <Link className="customer-back" href="/customer">
        <ArrowLeft size={15} aria-hidden="true" /> All claims
      </Link>

      <header className="customer-case-head">
        <div>
          <p className="customer-eyebrow">Claim {claim.reference}</p>
          <h1>{claim.agentName ?? "Damage claim"}</h1>
          <div className="customer-case-meta customer-case-meta-wide">
            <span className={`badge ${claim.status}`}>{STATUS[claim.status].label}</span>
            <span>Revision {claim.revision}</span>
            <span>Last updated {fmt(claim.updatedAt)}</span>
          </div>
        </div>
        <form action={signOut}>
          <ActionButton className="customer-quiet">Sign out</ActionButton>
        </form>
      </header>

      {notice && <p className="notice error" role="alert">{notice}</p>}
      {uploaded && (
        <p className="notice ok" role="status">
          Files added. The case moved to revision {claim.revision} and our broker will check the new evidence.
        </p>
      )}

      <section className="card customer-need" aria-labelledby="need-title">
        <div className="customer-card-title">
          <ShieldCheck size={17} aria-hidden="true" />
          <h2 id="need-title">What we need from you</h2>
        </div>
        <p>{need}</p>
        {openFindings.length > 0 && (
          <ul className="customer-findings">
            {openFindings.map((finding) => (
              <li key={finding.id}>
                <strong>{FINDING_LABEL[finding.rule] ?? "Something to check"}</strong>
                <p>{finding.explanation}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="customer-fineprint">
          <MessageCircle size={13} aria-hidden="true" /> A person reviews everything. Our broker reads your messages and
          approves every reply — there is no automatic agent chat.
        </p>
      </section>

      <div className="customer-case-grid">
        <section className="card customer-chat-card" aria-labelledby="chat-title">
          <div className="customer-card-title">
            <MessageCircle size={17} aria-hidden="true" />
            <h2 id="chat-title">Conversation</h2>
          </div>
          <p className="muted">Write to your broker here. They reply in the same thread.</p>

          <div className="chat-layout customer-chat-layout">
            <div className="chat-panel">
              <div className="chat-thread">
                {thread.length ? (
                  thread.map((message) => {
                    const outbound = message.direction === "outbound";
                    return (
                      <article key={message.id} className={`chat-bubble${outbound ? " outbound" : ""}`}>
                        <div className="chat-meta">
                          <strong>{outbound ? "Broker" : customer.name}</strong>
                          <span>{CHANNEL_LABEL[message.channel] ?? message.channel}</span>
                          <time dateTime={message.createdAt.toISOString()}>{fmt(message.createdAt)}</time>
                        </div>
                        {message.body && <p>{message.body}</p>}
                        {message.attachments.length > 0 && (
                          <div className="chat-attachments">
                            {message.attachments.map((file) => {
                              const Icon = FILE_ICON[file.kind as keyof typeof FILE_ICON] ?? Paperclip;
                              return (
                                <a
                                  key={`${message.id}-${file.sourceId}-${file.version}`}
                                  className="chat-file"
                                  href={`/cases/${claim.id}/sources/${file.sourceId}/${file.version}/file`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Icon size={13} aria-hidden="true" /> <span>{file.name}</span>
                                </a>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })
                ) : (
                  <p className="chat-empty">No messages yet. Write the first one below.</p>
                )}
              </div>

              <form className="chat-composer" action={postMessage}>
                <input type="hidden" name="caseId" value={claim.id} />
                <textarea
                  name="body"
                  rows={2}
                  maxLength={4000}
                  required
                  placeholder="Write to your broker…"
                  aria-label="Message to your broker"
                />
                <ActionButton pendingLabel="Sending…">Send</ActionButton>
              </form>
            </div>
          </div>
        </section>

        <div className="customer-case-side">
          <section className="card customer-upload" aria-labelledby="upload-title">
            <div className="customer-card-title">
              <Paperclip size={17} aria-hidden="true" />
              <h2 id="upload-title">Add photos or documents</h2>
            </div>
            <p className="muted">
              Adding evidence starts a new review: the case revision goes up and our broker checks the new files again.
            </p>
            <form action="/customer/submit" method="post" encType="multipart/form-data" className="customer-form">
              <input type="hidden" name="intent" value="evidence" />
              <input type="hidden" name="caseId" value={claim.id} />
              <label className="customer-field customer-drop">
                <span>Files</span>
                <input type="file" name="files" multiple accept={ACCEPTED_UPLOADS.join(",")} required />
                <small className="customer-hint">
                  JPG, PNG, WebP, PDF or TXT · up to {MAX_UPLOADS} files · {MB} MB each.
                </small>
              </label>
              <label className="customer-field">
                <span>Message (optional)</span>
                <textarea name="message" rows={2} maxLength={4000} placeholder="What are these files?" />
              </label>
              <ActionButton className="customer-submit" pendingLabel="Adding files…">
                Add to my claim
              </ActionButton>
            </form>
          </section>

          <section className="card customer-details" aria-labelledby="details-title">
            <h2 id="details-title">Your claim</h2>
            <dl className="customer-summary">
              <div>
                <dt>Reference</dt>
                <dd>{claim.reference}</dd>
              </div>
              <div>
                <dt>Claim type</dt>
                <dd>{claim.agentName ?? "Damage claim"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{STATUS[claim.status].label}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{claim.revision}</dd>
              </div>
            </dl>
            <p className="muted">{NEED_DETAIL[claim.status]}</p>
          </section>
        </div>
      </div>
    </>
  );
}
