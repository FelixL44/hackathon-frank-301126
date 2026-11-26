import { ArrowLeft, Bot, PauseCircle, PlayCircle } from "lucide-react";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionButton } from "../../../../action-button.tsx";
import { agents, cases } from "../../../../../db/schema.ts";
import { getDb } from "../../../../../server/db.ts";
import { fmt } from "../../../../status.ts";
import { updateAgent } from "../../../actions.ts";
import { AgentFields } from "../agent-fields.tsx";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function errorMessage(value: string | string[] | undefined) {
  if (value === "slug") return "That slug is already used by another agent. Pick a different one.";
  if (value === "invalid") return "Some fields were invalid. Check the name, the slug (lowercase, 2–40 characters) and the length limits.";
  if (value === "missing") return "That agent no longer exists.";
  return value ? "The agent could not be saved. Try again." : null;
}

export default async function AdminAgent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) notFound();

  const db = await getDb();
  const [rows, caseCounts] = await Promise.all([
    db.select().from(agents).where(eq(agents.id, parsed.data)).limit(1),
    db.select({ n: count() }).from(cases).where(eq(cases.agentId, parsed.data)),
  ]);
  const agent = rows[0];
  if (!agent) notFound();
  const caseCount = caseCounts[0]?.n ?? 0;
  const active = agent.status === "active";
  const message = errorMessage(error);

  return (
    <>
      <Link className="case-back" href="/admin/agents"><ArrowLeft size={15} aria-hidden="true" /> All agents</Link>

      <header className="row broker-heading">
        <div>
          <h1>{agent.name}</h1>
          <p className="muted"><code>{agent.slug}</code> · {caseCount} {caseCount === 1 ? "linked case" : "linked cases"}</p>
        </div>
        <span className={`badge ${active ? "admin-status-active" : "admin-status-paused"}`}>{active ? "Active" : "Paused"}</span>
      </header>

      {saved === "1" && <p className="notice ok" role="status">Agent saved.</p>}
      {message && <p className="notice error" role="alert">{message}</p>}

      <div className="admin-editor">
        <section className="card" aria-labelledby="admin-agent-config">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-agent-config">Configuration</h2>
              <p className="muted">The prompt and the evidence this claim type expects.</p>
            </div>
          </header>
          <form action={updateAgent} className="admin-form">
            <input type="hidden" name="id" value={agent.id} />
            <AgentFields agent={{
              name: agent.name,
              slug: agent.slug,
              description: agent.description,
              prompt: agent.prompt,
              requiredFields: agent.requiredFields,
              requiredDocuments: agent.requiredDocuments,
              sortOrder: agent.sortOrder,
            }} />
            <div className="admin-form-actions">
              <ActionButton pendingLabel="Saving…">Save agent</ActionButton>
              <span className="muted">Existing cases keep this agent.</span>
            </div>
          </form>
        </section>

        <aside className="card" aria-labelledby="admin-agent-lifecycle">
          <header className="admin-section-head">
            <div>
              <h2 id="admin-agent-lifecycle">Lifecycle</h2>
            </div>
          </header>
          <p className="admin-lifecycle-note">
            {active
              ? "Active agents appear on the customer website. Pausing archives this claim type without touching its cases."
              : "Paused agents are hidden from the customer website. Activate it to offer this claim type again."}
          </p>
          <div className="admin-lifecycle-state">
            <span className={`badge ${active ? "admin-status-active" : "admin-status-paused"}`}>{active ? "Active" : "Paused"}</span>
            <span className="muted">{caseCount} {caseCount === 1 ? "case" : "cases"} linked</span>
          </div>
          <form action={updateAgent}>
            <input type="hidden" name="id" value={agent.id} />
            <input type="hidden" name="intent" value="status" />
            <input type="hidden" name="status" value={active ? "paused" : "active"} />
            <ActionButton className={active ? "secondary" : undefined} pendingLabel="Updating…">
              {active ? <PauseCircle size={16} aria-hidden="true" /> : <PlayCircle size={16} aria-hidden="true" />}
              {active ? "Pause agent" : "Activate agent"}
            </ActionButton>
          </form>

          <p className="admin-lifecycle-note">
            {caseCount
              ? "This agent has cases, so it is never deleted. Pausing is the archive action."
              : "Agents without cases can stay paused; this demo has no delete action."}
          </p>

          <hr className="nav-divider" />
          <dl className="admin-meta-list">
            <div><dt>Slug</dt><dd><code>{agent.slug}</code></dd></div>
            <div><dt>Cases</dt><dd>{caseCount}</dd></div>
            <div><dt>Created</dt><dd>{fmt(agent.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{fmt(agent.updatedAt)}</dd></div>
          </dl>
          <p className="muted admin-footnote">
            <Bot size={14} aria-hidden="true" /> The agent checks evidence only; it never judges liability, coverage or payout.
          </p>
        </aside>
      </div>
    </>
  );
}
