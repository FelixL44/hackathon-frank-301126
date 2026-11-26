import { ChevronDown, ClipboardCheck, Globe2, LogOut, MessageCircle, ShieldCheck } from "lucide-react";
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
        <div className="workspace-topline">
          <Link className="workspace-brand" href="/admin">
            <img src="/frank-logo.webp" alt="FRANK" width={120} height={40} />
            <small>Admin workspace</small>
          </Link>
          <details className="account-menu">
            <summary aria-label="Account menu" title="Account">
              <span className="workspace-avatar" aria-hidden="true">A</span>
              <ChevronDown size={13} aria-hidden="true" />
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
        </div>

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
