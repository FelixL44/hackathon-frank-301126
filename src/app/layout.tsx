import Link from "next/link";
import type { ReactNode } from "react";
import { extractionLabel } from "../server/extractor.ts";
import "./globals.css";

export const metadata = { title: "Claim intake", description: "Motor claim intake agent for brokers (demo)" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topbar">
          <Link href="/" className="brand">
            Claim intake
          </Link>
          <span className="muted">Demo · synthetic data only · Extraction: {extractionLabel()}</span>
        </nav>
        {children}
      </body>
    </html>
  );
}
