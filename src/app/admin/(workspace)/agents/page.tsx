import { Bot, Plus } from "lucide-react";
import { count } from "drizzle-orm";
import Link from "next/link";
import { ActionButton } from "../../../action-button.tsx";
import { agents, cases } from "../../../../db/schema.ts";
import { getDb } from "../../../../server/db.ts";
import { createAgent } from "../../actions.ts";
import { AgentFields } from "./agent-fields.tsx";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function errorMessage(value: string | string[] | undefined) {
  if (value === "slug") return "That slug is already used by another agent. Pick a different one.";
  if (value === "invalid") return "Some fields were invalid. Check the name, the slug (lowercase, 2–40 characters) and the length limits.";
  if (value === "missing") return "That agent no longer exists.";
  return value ? "The agent could not be saved. Try again." : null;
}

export default async function AdminAgents({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { error } = await searchParams;
  const db = await getDb();
  const [rows, caseCounts] = await Promise.all([
    db.select().from(agents).orderBy(agents.sortOrder, agents.name),
    db.select({ agentId: cases.agentId, n: count() }).from(cases).groupBy(cases.agentId),
  ]);
  const casesByAgent = new Map<string, number>();
  for (const row of caseCounts) if (row.agentId) casesByAgent.set(row.agentId, row.n);
  const message = errorMessage(error);
  const active = rows.filter((agent) => agent.status === "active").length;

  return (
    <>
      <header className="row broker-heading">
        <div>
          <h1>Agents</h1>
          <p className="muted">Claim types customers choose, with their prompt, required fields and documents.</p>
        </div>
        <Link className="broker-button" href="/admin">Overview</Link>
      </header>

      {message && <p className="notice error" role="alert">{message}</p>}

      <div className="admin-agents-layout">
        <section className="card" aria-labelledby="admin-agent-list">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-agent-list">Claim agents</h2>
              <p className="muted">{rows.length} {rows.length === 1 ? "agent" : "agents"}, {active} active.</p>
            </div>
            <span className="badge">{rows.length}</span>
          </header>

          {rows.length ? (
            <div className="admin-agent-list">
              {rows.map((agent) => {
                const caseCount = casesByAgent.get(agent.id) ?? 0;
                return (
                  <article className="admin-agent" key={agent.id}>
                    <div>
                      <div className="admin-agent-title">
                        <h3>{agent.name}</h3>
                        <span className={`badge ${agent.status === "active" ? "admin-status-active" : "admin-status-paused"}`}>
                          {agent.status === "active" ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p><code>{agent.slug}</code> · {caseCount} {caseCount === 1 ? "case" : "cases"}</p>
                      {agent.description && <p>{agent.description}</p>}
                      <dl className="admin-agent-facts">
                        <div>
                          <dt>Required documents</dt>
                          <dd>{agent.requiredDocuments.join(", ") || "None"}</dd>
                        </div>
                        <div>
                          <dt>Required fields</dt>
                          <dd>{agent.requiredFields.join(", ") || "None"}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="admin-agent-actions">
                      <Link className="broker-button" href={`/admin/agents/${agent.id}`}>Edit</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="case-empty">
              <span className="icon-tile"><Bot size={21} aria-hidden="true" /></span>
              <strong>No agents yet</strong>
              <span className="muted">Create the first claim type with the form next to this list.</span>
            </div>
          )}
        </section>

        <section className="card" id="new-agent" aria-labelledby="admin-new-agent">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-new-agent">Create agent</h2>
              <p className="muted">A new claim type starts active for customers.</p>
            </div>
          </header>
          <form action={createAgent} className="admin-form">
            <AgentFields />
            <div className="admin-form-actions">
              <ActionButton pendingLabel="Creating…"><Plus size={16} aria-hidden="true" /> Create agent</ActionButton>
              <span className="muted">You can pause it after creating it.</span>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
