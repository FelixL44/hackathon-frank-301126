import { Archive, BookOpen, ChevronsUpDown, ClipboardCheck, Clock3, Inbox, MessageCircle, Search } from "lucide-react";
import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";
import { messages } from "../db/schema.ts";
import { getDb } from "../server/db.ts";
import { extractionStatus } from "../server/extractor.ts";

export const queues = [
  { id: "all", label: "All cases", icon: Inbox },
  { id: "review", label: "Needs my action", icon: ClipboardCheck },
  { id: "waiting", label: "Waiting for reply", icon: Clock3 },
  { id: "submitted", label: "Submitted", icon: Archive },
] as const;

export type Queue = (typeof queues)[number]["id"];
type Section = Queue | "whatsapp";

/** Active background of a nav item or tab. The shared name makes React slide it to the new item on navigation. */
export function ActivePill({ name, className }: { name: string; className: string }) {
  return <ViewTransition name={name} share="pill-move" default="none"><span className={className} aria-hidden="true" /></ViewTransition>;
}

export async function BrokerShell({
  children, queue, counts, returnTo, section,
}: {
  children: ReactNode;
  queue?: Queue;
  counts?: Record<Queue, number>;
  returnTo?: string;
  section?: "whatsapp";
}) {
  const detail = returnTo !== undefined;
  const originQueue = detail ? new URLSearchParams(returnTo.slice(2)).get("queue") : null;
  const active: Section = section ?? queue ?? queues.find(({ id }) => id === originQueue)?.id ?? "all";
  const db = await getDb();
  const mode = await extractionStatus(db);
  const [drafts] = await db.select({ n: count() }).from(messages)
    .where(and(eq(messages.status, "draft"), eq(messages.direction, "outbound")));
  const current = (id: Section) => id === active ? (detail ? "location" : "page") : undefined;

  return (
    <div className="broker-shell">
      <aside className="broker-sidebar">
        <div className="workspace-account">
          <span className="workspace-avatar" aria-hidden="true">B</span>
          <span><strong>Demo broker</strong><small title={mode}>{mode.startsWith("fixture data") ? "Fixture extraction" : mode}</small></span>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </div>
        <form action="/" role="search" className="broker-search">
          <Search size={18} aria-hidden="true" />
          <input name="q" type="search" aria-label="Quick search all cases" placeholder="Quick search" />
        </form>
        <nav aria-label="Workspace" className="broker-nav">
          {queues.map(({ id, label, icon: Icon }) => (
            <Link key={id} href={id === "all" ? "/" : `/?queue=${id}`} aria-current={current(id)}>
              {id === active && <ActivePill name="nav-pill" className="nav-pill" />}
              <Icon size={19} aria-hidden="true" /> <span>{label}</span>
              {counts && <span className="nav-count">{counts[id]}</span>}
            </Link>
          ))}
          <hr className="nav-divider" />
          <Link href="/whatsapp" aria-current={current("whatsapp")}>
            {active === "whatsapp" && <ActivePill name="nav-pill" className="nav-pill" />}
            <MessageCircle size={19} aria-hidden="true" /> <span>WhatsApp</span>
            {drafts!.n > 0 && <span className="nav-count" title="Drafts ready to send">{drafts!.n}</span>}
          </Link>
        </nav>
        <div className="broker-sidebar-footer">
          <a className="workspace-guide" href="/architecture.html"><BookOpen size={19} aria-hidden="true" /> Workflow guide</a>
        </div>
      </aside>
      <main className="broker-main">
        <ViewTransition default="page-swap">
          <div>{children}</div>
        </ViewTransition>
      </main>
    </div>
  );
}
