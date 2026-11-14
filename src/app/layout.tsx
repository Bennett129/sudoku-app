import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_THEME } from "@/lib/themes";
import "./globals.css";
import "./theme-placeholders.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sudoku",
  description: "Mobile-friendly sudoku from 4×4 to 25×25.",
};

// Browser zoom stays enabled (no maximum-scale) for accessibility;
// the grid has its own pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Apply the saved theme before first paint so the default photo never flashes.
// Must match the persist key in src/store/settings.ts.
const themeBootScript = `try{var t=JSON.parse(localStorage.getItem("sudoku-settings")).state.theme;if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <div className="app-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
