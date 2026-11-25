import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Claim intake", description: "Claim intake workspace for insurance brokers" };
export const viewport = { themeColor: "#00888F" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
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
      <body>{children}</body>
    </html>
  );
}
