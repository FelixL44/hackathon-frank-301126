import { ChevronsUpDown, ClipboardCheck, Globe2, LogOut, MessageCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "../../../server/auth.ts";
import { signOut } from "../actions.ts";
import { AdminNav } from "../admin-nav.tsx";

export default async function AdminWorkspaceLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <div className="broker-shell admin-shell">
      <aside className="broker-sidebar admin-sidebar">
        <details className="account-menu account-menu-wide">
          <summary className="workspace-account" aria-label="Account menu" title="Account">
            <span className="workspace-avatar" aria-hidden="true">A</span>
            <span><strong>Demo admin</strong><small>Admin workspace</small></span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </summary>
          <div className="account-options">
            <span className="account-identity">
              <strong>Demo admin</strong>
              <small>Agents &amp; integrations</small>
            </span>
            <Link href="/"><ClipboardCheck size={16} aria-hidden="true" /> Broker workspace</Link>
            <Link href="/whatsapp"><MessageCircle size={16} aria-hidden="true" /> WhatsApp inbox</Link>
            <Link href="/customer"><Globe2 size={16} aria-hidden="true" /> Customer website</Link>
            <hr className="nav-divider" />
            <form action={signOut} className="admin-signout">
              <button type="submit"><LogOut size={16} aria-hidden="true" /> Sign out</button>
            </form>
          </div>
        </details>

        <AdminNav />

        <div className="broker-sidebar-footer">
          <Link className="workspace-guide" href="/admin/integrations">
            Integration status <ShieldCheck size={15} aria-hidden="true" />
          </Link>
          <p className="admin-sidebar-note">
            <ShieldCheck size={14} aria-hidden="true" /> Demo admin with synthetic data.
          </p>
        </div>
      </aside>
      <main className="broker-main">{children}</main>
    </div>
  );
}
