import { Archive, ArrowUpRight, ClipboardCheck, Clock3, Inbox, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "../server/db.ts";
import { extractionStatus } from "../server/extractor.ts";

export const queues = [
  { id: "all", label: "All cases", icon: Inbox },
  { id: "review", label: "Needs my action", icon: ClipboardCheck },
  { id: "waiting", label: "Waiting for reply", icon: Clock3 },
  { id: "submitted", label: "Submitted", icon: Archive },
] as const;

export type Queue = (typeof queues)[number]["id"];

export async function BrokerShell({
  children, queue, counts, returnTo,
}: {
  children: ReactNode;
  queue?: Queue;
  counts?: Record<Queue, number>;
  returnTo?: string;
}) {
  const detail = returnTo !== undefined;
  const originQueue = detail ? new URLSearchParams(returnTo.slice(2)).get("queue") : null;
  const active = queue ?? queues.find(({ id }) => id === originQueue)?.id ?? "all";
  const mode = await extractionStatus(await getDb());

  return (
    <div className="broker-shell">
      <aside className="broker-sidebar">
        <Link className="workspace-brand" href="/">
          <img src="/frank-logo.webp" alt="FRANK" width={120} height={40} />
          <small>Broker workspace</small>
        </Link>
        <form action="/" role="search" className="broker-search sidebar-search">
          <Search size={17} aria-hidden="true" />
          <input name="q" type="search" aria-label="Quick search all cases" placeholder="Quick search" />
        </form>
        <nav aria-label="Case queues" className="broker-nav">
          {queues.map(({ id, label, icon: Icon }) => (
            <Link key={id} href={id === "all" ? "/" : `/?queue=${id}`} aria-current={id === active ? (detail ? "location" : "page") : undefined}>
              <Icon size={18} aria-hidden="true" /> <span>{label}</span>
              {counts && <span className="nav-count">{counts[id]}</span>}
            </Link>
          ))}
        </nav>
        <div className="broker-sidebar-footer">
          <a className="workspace-guide" href="/architecture.html">Workflow guide <ArrowUpRight size={15} aria-hidden="true" /></a>
          <div className="workspace-account">
            <span className="workspace-avatar" aria-hidden="true">B</span>
            <span><strong>Demo broker</strong><small title={mode}>{mode.startsWith("fixture data") ? "Fixture extraction" : mode}</small></span>
          </div>
        </div>
      </aside>
      <main className="broker-main">{children}</main>
    </div>
  );
}
