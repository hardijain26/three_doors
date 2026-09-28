"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { signOutEverywhere } from "@/lib/client/ai.ts";

const TABS = [["/roles", "Roles"], ["/people", "People"], ["/settings/ai", "AI settings"], ["/settings/profile", "Profile & privacy"]];
export default function Nav() {
  const path = usePathname(); const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null)); }, [path]);
  return (
    <nav className="nav">
      <Link href="/" className="brand">Three Doors</Link>
      {email && TABS.map(([h, l]) => <Link key={h} href={h} className={`tab${path.startsWith(h) ? " on" : ""}`}>{l}</Link>)}
      <span className="sp" />
      <Link href="/privacy" className="tab">How we handle data</Link>
      {email ? <button className="link" onClick={async () => { await signOutEverywhere(); router.push("/login"); }}>Sign out</button>
        : <Link href="/login" className="btn primary">Sign in</Link>}
    </nav>
  );
}
