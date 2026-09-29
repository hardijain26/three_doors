import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Nav from "./nav.tsx";
import Breaks from "@/components/breaks.tsx";

export const metadata: Metadata = { title: "Three Doors", description: "Job-search outreach on your own AI key." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F0F9FF" }, { media: "(prefers-color-scheme: dark)", color: "#0B1220" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Nav /><main className="wrap">{children}</main><Breaks /></body></html>);
}
