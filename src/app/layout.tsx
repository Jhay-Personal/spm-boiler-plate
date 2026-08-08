import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { ErrorDialogProvider } from "@/components/ui/ErrorDialogProvider";
import { THEME_INIT_SCRIPT } from "@/features/theme/theme";

export const metadata: Metadata = {
  title: "Admin Portal",
  description:
    "Admin console with role-based module access, user management and theming.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The palette is swapped by data-theme, but this tells the browser to render
  // its own chrome (scrollbars, form controls) for whichever is active.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce minted per request in src/proxy.ts and forwarded as a header. The
  // theme script below is inline and must carry it, or the CSP blocks it and
  // the page flashes the wrong colours on every load.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          // Static, self-contained string from our own source — no user input
          // reaches it. It must run before first paint, which rules out any
          // React-rendered alternative.
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ErrorDialogProvider>{children}</ErrorDialogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
