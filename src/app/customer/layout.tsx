import Link from "next/link";
import type { ReactNode } from "react";
import "./customer.css";

export const metadata = {
  title: "FRANK · Claims portal",
  description: "Report a claim and follow it with your broker",
};

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="customer-shell">
      <header className="customer-topbar">
        <Link className="customer-brand" href="/customer" aria-label="FRANK claims portal">
          <img src="/frank-logo.webp" alt="FRANK" width={104} height={34} />
          <span>Claims portal</span>
        </Link>
        <Link className="customer-topbar-link" href="/customer/new">
          Report a claim
        </Link>
      </header>
      <main className="customer-main">{children}</main>
      <footer className="customer-footer">
        <span>FRANK demo · synthetic data only</span>
        <Link href="/">Broker workspace</Link>
      </footer>
    </div>
  );
}
