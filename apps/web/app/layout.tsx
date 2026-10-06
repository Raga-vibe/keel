import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { Nav } from "@/components/Nav";
import { KeelProvider } from "@/lib/keel";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif-display", weight: ["500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Keel — plan for business price risk",
  description:
    "Model how currency, fuel, and metal price moves could affect future business costs. Review hedge size, collateral, costs, and risks before trading.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <KeelProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted sm:px-6">
            Keel helps model and manage perpetual-futures hedges on Hyperliquid. It does not fix supplier prices or hold your funds.
            Hedges require collateral, have costs, and can be liquidated. Estimates may differ from actual outcomes. Not investment advice.
          </footer>
        </KeelProvider>
      </body>
    </html>
  );
}
