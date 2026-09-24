import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { Nav } from "@/components/Nav";
import { KeelProvider } from "@/lib/keel";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif-display", weight: ["500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Keel — price certainty for real businesses",
  description:
    "Lock in what you pay for fuel, metals and foreign currency. Keel hedges real-world costs on Hyperliquid's 24/7 markets, with no bank and no custody.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <KeelProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted sm:px-6">
            Keel is non-custodial software. Hedges are perpetual futures on Hyperliquid, held in your own account.
            Prices move; a hedge limits risk but has costs. Not investment advice.
          </footer>
        </KeelProvider>
      </body>
    </html>
  );
}
