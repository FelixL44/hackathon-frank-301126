import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "../server/db.ts";
import { extractionStatus } from "../server/extractor.ts";
import "./globals.css";

export const metadata = { title: "Claim intake", description: "Motor claim intake agent for brokers (demo)" };
export const viewport = { themeColor: "#00888F" };
export const dynamic = "force-dynamic"; // the header reads today's model spend; never prerender at build time

export default async function RootLayout({ children }: { children: ReactNode }) {
  const status = await extractionStatus(await getDb());
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap"
        />
      </head>
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
