import "./globals.css";
import type { ReactNode } from "react";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export const metadata = { title: `${TOKEN_DISPLAY_NAME} Explorer` };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
