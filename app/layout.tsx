import "./globals.css";
import type { Metadata } from "next";
import Nav from "./nav.tsx";

export const metadata: Metadata = { title: "Three Doors", description: "Job-search outreach on your own AI key." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Nav /><main className="wrap">{children}</main></body></html>);
}
