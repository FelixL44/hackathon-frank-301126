import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "../server/db.ts";
import { extractionStatus } from "../server/extractor.ts";
import "./globals.css";

export const metadata = { title: "Claim intake", description: "Motor claim intake agent for brokers (demo)" };
export const dynamic = "force-dynamic"; // the header reads today's model spend; never prerender at build time

export default async function RootLayout({ children }: { children: ReactNode }) {
  const status = await extractionStatus(await getDb());
  return (
    <html lang="en">
      <body>
        <nav className="topbar">
          <Link href="/" className="brand">
            Claim intake
          </Link>
          <span className="muted">Demo · synthetic data only · Extraction: {status}</span>
        </nav>
        {children}
      </body>
    </html>
  );
}
