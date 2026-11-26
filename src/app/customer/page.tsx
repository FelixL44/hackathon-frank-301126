import { asc } from "drizzle-orm";
import { ArrowRight, Camera, Clock3, FileCheck2, MessageCircle, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { customers } from "../../db/schema.ts";
import { currentCustomer } from "../../server/customer-session.ts";
import { getDb } from "../../server/db.ts";
import { customerCases } from "../../workflow/customer-intake.ts";
import { ActionButton } from "../action-button.tsx";
import { fmt, STATUS } from "../status.ts";
import { demoLogin, signOut, startSession } from "./actions.ts";
import { errorText } from "./errors.ts";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  web: "Website",
  demo: "Demo inbox",
  teams: "Teams",
  telegram: "Telegram",
};

const NEXT_STEP: Record<keyof typeof STATUS, string> = {
  intake: "We are reading your documents. This page updates after the broker looks at them.",
  awaiting_information: "Our broker may need a little more from you. Check the claim room.",
  broker_review: "Our broker is checking your evidence. No action needed right now.",
  awaiting_approval: "Your file is complete. The broker is preparing to forward it to the insurer.",
  submitting: "We are forwarding your claim to the insurer.",
  submitted: "Claim forwarded. Our broker will contact you if anything else is needed.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function CustomerHome({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const search = await searchParams;
  const notice = errorText(search.error);
  const db = await getDb();
  const customer = await currentCustomer(db);

  if (customer) {
    const cases = await customerCases(db, customer.id);
    const firstName = customer.name.split(" ")[0] ?? customer.name;

    return (
      <>
        {notice && <p className="notice error" role="alert">{notice}</p>}

        <section className="customer-welcome">
          <div>
            <p className="customer-eyebrow">Your claims</p>
            <h1>Hello, {firstName}</h1>
            <p className="customer-lede">
              Report new damage, follow what our broker is doing, and send anything they ask for.
            </p>
          </div>
          <div className="customer-welcome-actions">
            <Link className="customer-cta" href="/customer/new">
              <Plus size={17} aria-hidden="true" /> Start a new claim
            </Link>
            <form action={signOut}>
              <ActionButton className="customer-quiet">Sign out</ActionButton>
            </form>
          </div>
        </section>

        <section aria-labelledby="your-claims">
          <div className="customer-section-head">
            <h2 id="your-claims">Your claims</h2>
            <span className="muted">{cases.length === 1 ? "1 claim" : `${cases.length} claims`}</span>
          </div>

          {cases.length ? (
            <ul className="customer-case-list">
              {cases.map((claim) => (
                <li key={claim.id}>
                  <Link className="customer-case-card" href={`/customer/cases/${claim.id}`}>
                    <div className="customer-case-top">
                      <div>
                        <span className="customer-case-ref">{claim.reference}</span>
                        <strong>{claim.agentName ?? "Damage claim"}</strong>
                      </div>
                      <span className={`badge ${claim.status}`}>{STATUS[claim.status].label}</span>
                    </div>
                    <p className="customer-case-next">{NEXT_STEP[claim.status]}</p>
                    <div className="customer-case-meta">
                      <span>
                        <Clock3 size={14} aria-hidden="true" /> Updated {fmt(claim.updatedAt)}
                      </span>
                      <span>Revision {claim.revision}</span>
                      <span className="customer-case-open">
                        Open claim <ArrowRight size={14} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="card customer-empty">
              <span className="customer-icon-tile"><Camera size={22} aria-hidden="true" /></span>
              <h2>No claims yet</h2>
              <p className="muted">
                Start with what happened and a photo of the damage. Our broker checks the file and tells you what is
                missing.
              </p>
              <Link className="customer-cta" href="/customer/new">
                Report your first claim <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
      </>
    );
  }

  const demoCustomers = await db
    .select({ id: customers.id, name: customers.name, channel: customers.channel, address: customers.address })
    .from(customers)
    .orderBy(asc(customers.createdAt))
    .limit(3);

  return (
    <>
      {notice && <p className="notice error" role="alert">{notice}</p>}

      <section className="customer-landing">
        <div className="customer-landing-copy">
          <p className="customer-eyebrow">
            <ShieldCheck size={14} aria-hidden="true" /> Claims, without the chase
          </p>
          <h1>Report a damage claim in a few minutes.</h1>
          <p className="customer-lede">
            Tell us what happened, add a photo and your documents. A real broker checks everything and keeps you posted
            here — no phone queues, no lost email threads.
          </p>
          <ol className="customer-steps">
            <li>
              <span className="customer-step-number">01</span>
              <div>
                <strong>Describe the damage</strong>
                <p>Pick the claim type and write what happened in your own words.</p>
              </div>
            </li>
            <li>
              <span className="customer-step-number">02</span>
              <div>
                <strong>Add photos and documents</strong>
                <p>A photo of the damage and your estimate or invoice are usually enough to start.</p>
              </div>
            </li>
            <li>
              <span className="customer-step-number">03</span>
              <div>
                <strong>Follow it with your broker</strong>
                <p>Our broker reviews the file, asks for anything missing and files the claim.</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="customer-landing-side">
          <section className="card customer-signin" aria-labelledby="signin-title">
            <h2 id="signin-title">Report a claim</h2>
            <p className="muted">Use your name and the phone number or email your broker already knows.</p>
            <form action={startSession} className="customer-form">
              <label className="customer-field">
                <span>Your name</span>
                <input name="name" required maxLength={120} autoComplete="name" placeholder="Ana Ferreira" />
              </label>
              <label className="customer-field">
                <span>Phone or email</span>
                <input
                  name="contact"
                  required
                  maxLength={200}
                  autoComplete="tel"
                  placeholder="+351 900 000 001 or you@example.com"
                />
              </label>
              <ActionButton className="customer-submit" pendingLabel="Opening…">
                Continue <ArrowRight size={16} aria-hidden="true" />
              </ActionButton>
            </form>
            <p className="customer-fineprint">
              <ShieldCheck size={13} aria-hidden="true" /> Demo portal. All customers, photos and policies are
              synthetic.
            </p>
          </section>

          {demoCustomers.length > 0 && (
            <section className="card customer-demo" aria-labelledby="demo-title">
              <h2 id="demo-title">Demo access</h2>
              <p className="muted">Jump into a seeded customer to see a claim that is already in progress.</p>
              <ul>
                {demoCustomers.map((row) => (
                  <li key={row.id}>
                    <form action={demoLogin}>
                      <input type="hidden" name="customerId" value={row.id} />
                      <button type="submit" className="customer-demo-row">
                        <span className="customer-demo-avatar" aria-hidden="true">
                          {row.name.slice(0, 1)}
                        </span>
                        <span className="customer-demo-copy">
                          <strong>{row.name}</strong>
                          <small>
                            {CHANNEL_LABEL[row.channel] ?? row.channel} · {row.address}
                          </small>
                        </span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="customer-fineprint">
                <FileCheck2 size={13} aria-hidden="true" /> No password in the demo: the session cookie carries the
                chosen customer id.
              </p>
            </section>
          )}
        </div>
      </section>

      <section className="customer-promise" aria-label="What to expect">
        <div className="customer-promise-item">
          <MessageCircle size={18} aria-hidden="true" />
          <div>
            <strong>A person replies</strong>
            <p className="muted">Our broker reads every message. Nothing is sent to you automatically.</p>
          </div>
        </div>
        <div className="customer-promise-item">
          <FileCheck2 size={18} aria-hidden="true" />
          <div>
            <strong>One place for evidence</strong>
            <p className="muted">Add a corrected estimate at any time; it stays with the same claim.</p>
          </div>
        </div>
      </section>
    </>
  );
}
