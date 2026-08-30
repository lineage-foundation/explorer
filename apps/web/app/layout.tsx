import "./globals.css";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";
import { SiteHeader } from "./components/SiteHeader.js";
import { SiteFooter } from "./components/SiteFooter.js";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: `${TOKEN_DISPLAY_NAME} Explorer`,
  description: `Explore blocks, transactions, and addresses on ${TOKEN_DISPLAY_NAME}.`,
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/images/lineage-favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/images/lineage-favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/lineage-favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/images/lineage-favicon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/images/lineage-favicon-180x180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
