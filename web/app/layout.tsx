import type { Metadata, Viewport } from "next";
import { Montserrat, Zilla_Slab } from "next/font/google";
import { Header } from "@/components/header";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const zilla = Zilla_Slab({ variable: "--font-zilla", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://akasa-demo-tau.vercel.app"),
  title: { default: "Threshold: autonomy you can audit", template: "%s · Threshold" },
  description:
    "An unofficial concept by Hafsa Usmani: the eval harness and exception router you'd want behind an autonomous inpatient coder. Synthetic charts, real agent runs, every code cited.",
};

export const viewport: Viewport = { themeColor: "#1d334d", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${montserrat.variable} ${zilla.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col font-sans text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-coral-ink focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <div className="bg-navy-deep text-center text-[12px] font-medium tracking-wide text-white/85">
          <p className="mx-auto max-w-6xl px-4 py-1.5">
            Unofficial concept by Hafsa Usmani · Not affiliated with Akasa · Synthetic charts only, no patient data
          </p>
        </div>
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-8 text-sm text-ink-dim">
            <p>
              Built by{" "}
              <a className="font-semibold text-ink underline-offset-4 hover:underline" href="https://hafsausmani.com">
                Hafsa Usmani
              </a>{" "}
              as an application for Software Engineer, Applied AI. Not affiliated with or endorsed by Akasa.
            </p>
            <div className="flex gap-5">
              <a className="font-semibold text-ink underline-offset-4 hover:underline" href="https://github.com/hafsau/akasa-demo">
                Source
              </a>
              <a className="font-semibold text-ink underline-offset-4 hover:underline" href="/about">
                How it works
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
