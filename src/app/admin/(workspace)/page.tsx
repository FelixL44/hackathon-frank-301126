import { ArrowUpRight, Bot, CheckCircle2, Cpu, FileText, MessageCircle, Send, UserRound } from "lucide-react";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { agents, cases } from "../../../db/schema.ts";
import { getDb } from "../../../server/db.ts";
import { adminCounts, integrationState } from "../../../server/settings.ts";
import { fmt, STATUS } from "../../status.ts";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const db = await getDb();
  const [counts, groups, latestAgents, recentCases] = await Promise.all([
    adminCounts(db),
    integrationState(db),
    db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, status: agents.status })
      .from(agents)
      .orderBy(desc(agents.createdAt), agents.name)
      .limit(4),
    db
      .select({ id: cases.id, reference: cases.reference, status: cases.status, updatedAt: cases.updatedAt })
      .from(cases)
      .orderBy(desc(cases.updatedAt), desc(cases.id))
      .limit(5),
  ]);

  const metrics = [
    { label: "Cases", value: counts.cases, note: "All claim files", icon: FileText },
    { label: "Submitted", value: counts.submitted, note: "Portal receipts stored", icon: CheckCircle2 },
    { label: "Customers", value: counts.customers, note: "Synthetic identities", icon: UserRound },
    { label: "Active agents", value: counts.agents, note: "Visible to customers", icon: Bot },
    { label: "Messages", value: counts.messages, note: "Inbound and outbound", icon: MessageCircle },
  ];

  const model = groups.find((group) => group.id === "model");
  const provider = model?.fields.find((field) => field.key === "model_provider");
  const providerValue = provider?.display ?? "";
  const providerLabel = provider?.options?.find((option) => option.value === providerValue)?.label ?? (providerValue || "Fixture mode");

  const whatsapp = groups.find((group) => group.id === "whatsapp");
  const whatsappReady = ["whatsapp_access_token", "whatsapp_phone_number_id"].every((key) =>
    whatsapp?.fields.some((field) => field.key === key && field.configured),
  );
  const whatsappNumber = whatsapp?.fields.find((field) => field.key === "whatsapp_number")?.display;

  const telegram = groups.find((group) => group.id === "telegram");
  const telegramReady = telegram?.fields.find((field) => field.key === "telegram_bot_token")?.configured ?? false;
  const telegramName = telegram?.fields.find((field) => field.key === "telegram_bot_name")?.display;

  return (
    <>
      <header className="row broker-heading">
        <div>
          <h1>Overview</h1>
          <p className="muted">Claim agents, integrations and the demo workspace at a glance.</p>
        </div>
        <span className="badge sim">Demo admin</span>
      </header>

      <p className="notice sim" role="note">
        This console is part of the hackathon demo. Counts and settings come from the local demo database; all customer data is synthetic.
      </p>

      <section className="admin-metrics" aria-label="Workspace counts">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <article className="card admin-metric" key={label}>
            <div className="admin-metric-head">
              <span className="admin-metric-label">{label}</span>
              <span className="icon-tile"><Icon size={16} aria-hidden="true" /></span>
            </div>
            <strong className="admin-metric-value">{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <header className="admin-section-head">
        <div>
          <h2>Integrations</h2>
          <p className="muted">What the next case will use.</p>
        </div>
        <Link className="broker-button" href="/admin/integrations">Manage integrations <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </header>

      <section className="admin-status-grid" aria-label="Integration status">
        <Link className="card admin-status-card" href="/admin/integrations#integration-model">
          <div className="admin-status-top">
            <h3>Model provider</h3>
            <span className={`badge ${provider?.configured ? "submitted" : "sim"}`}>{provider?.configured ? "Configured" : "Fixture mode"}</span>
          </div>
          <p><Cpu size={14} aria-hidden="true" /> {provider?.configured ? providerLabel : "No model configured"}</p>
          <p>{provider?.configured ? "Used on the next case; the database wins over the environment." : "The demo runs on the fixtures’ pre-extracted observations."}</p>
          <span className="admin-status-detail">Open model settings →</span>
        </Link>

        <Link className="card admin-status-card" href="/admin/integrations#integration-whatsapp">
          <div className="admin-status-top">
            <h3>WhatsApp</h3>
            <span className={`badge ${whatsappReady ? "submitted" : "sim"}`}>{whatsappReady ? "Ready" : "Not connected"}</span>
          </div>
          <p><MessageCircle size={14} aria-hidden="true" /> {whatsappReady ? whatsappNumber || "Credentials saved" : "Web inbox only"}</p>
          <p>{whatsappReady ? "Confirmed broker messages can leave the web inbox." : "Until credentials are saved, broker messages stay in the web inbox."}</p>
          <span className="admin-status-detail">Open WhatsApp settings →</span>
        </Link>

        <Link className="card admin-status-card" href="/admin/integrations#integration-telegram">
          <div className="admin-status-top">
            <h3>Telegram</h3>
            <span className={`badge ${telegramReady ? "submitted" : "sim"}`}>{telegramReady ? "Configured" : "Optional"}</span>
          </div>
          <p><Send size={14} aria-hidden="true" /> {telegramReady ? telegramName || "Bot token saved" : "Fallback channel"}</p>
          <p>{telegramReady ? "Available as a fallback if WhatsApp is not." : "Nothing is sent until a bot token is saved."}</p>
          <span className="admin-status-detail">Open Telegram settings →</span>
        </Link>
      </section>

      <div className="admin-panels">
        <section className="card" aria-labelledby="admin-latest-agents">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-latest-agents">Latest agents</h2>
              <p className="muted">Claim types the customer can choose.</p>
            </div>
            <Link className="broker-button" href="/admin/agents">Manage</Link>
          </header>
          {latestAgents.length ? (
            <ul className="admin-list">
              {latestAgents.map((agent) => (
                <li key={agent.id}>
                  <Link className="admin-list-row" href={`/admin/agents/${agent.id}`}>
                    <strong>{agent.name}</strong>
                    <code>{agent.slug}</code>
                    <span className={`badge ${agent.status === "active" ? "admin-status-active" : "admin-status-paused"}`}>
                      {agent.status === "active" ? "Active" : "Paused"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No agents yet. Create the first claim type from the agents page.</p>
          )}
        </section>

        <section className="card" aria-labelledby="admin-recent-cases">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-recent-cases">Recent cases</h2>
              <p className="muted">Newest activity in the broker workspace.</p>
            </div>
            <Link className="broker-button" href="/">Open cases</Link>
          </header>
          {recentCases.length ? (
            <div className="scroll">
              <table className="admin-recent">
                <thead>
                  <tr>
                    <th scope="col">Case</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCases.map((claim) => (
                    <tr key={claim.id}>
                      <td><Link href={`/cases/${claim.id}`}>{claim.reference}</Link></td>
                      <td><span className={`badge ${claim.status}`}>{STATUS[claim.status].label}</span></td>
                      <td><time dateTime={claim.updatedAt.toISOString()}>{fmt(claim.updatedAt)}</time></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No cases yet. Open a demo case from the broker workspace.</p>
          )}
        </section>
      </div>
    </>
  );
}
