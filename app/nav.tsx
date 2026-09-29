"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { signOutEverywhere } from "@/lib/client/ai.ts";
import { Icon } from "@/components/icons.tsx";

const TABS = [["/openings", "Openings", "search"], ["/roles", "Roles", "briefcase"], ["/people", "People", "users"], ["/career", "Career", "arrow"], ["/cv", "CV", "file"], ["/analytics", "Analytics", "chart"], ["/messages", "Messages", "message"], ["/settings/ai", "AI", "key"], ["/settings/profile", "Profile", "user"]] as const;
export default function Nav() {
  const path = usePathname(); const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { supabaseBrowser().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => setEmail(data.user?.email ?? null)); }, [path]);
  return (
    <header className="nav"><nav className="nav-in" aria-label="Main">
      <Link href={email ? "/roles" : "/"} className="brand"><span className="brand-mark" aria-hidden="true"><Icon name="door" /></span><span>Three Doors</span></Link>
      {email && TABS.map(([h, l, i]) => <Link key={h} href={h} className={`tab${path.startsWith(h) ? " on" : ""}`} aria-current={path.startsWith(h) ? "page" : undefined} title={l}><Icon name={i} /><span className="lbl">{l}</span></Link>)}
      <span className="sp" />
      <Link href="/privacy" className={`tab${path === "/privacy" ? " on" : ""}`} title="How we handle data" aria-label="How we handle data"><Icon name="shield" /></Link>
      {email ? <button className="tab" style={{ border: 0, background: "none" }} onClick={async () => { await signOutEverywhere(); router.push("/login"); }} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
        : path !== "/login" && <Link href="/login" className="btn primary">Sign in</Link>}
    </nav></header>
  );
}
