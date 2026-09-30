"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { signOutEverywhere } from "@/lib/client/ai.ts";
import { Icon } from "@/components/icons.tsx";

const TABS = [["/about", "About", "user"], ["/openings", "Openings", "search"], ["/roles", "Roles", "briefcase"], ["/people", "People", "users"], ["/cv", "CV", "file"], ["/analytics", "Analytics", "chart"], ["/messages", "Messages", "message"], ["/settings", "Settings", "settings"]] as const;
export default function Nav() {
  const path = usePathname(); const router = useRouter();
  const [email, setEmail] = useState<string | null>(null); const [fresh, setFresh] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(async ({ data }: { data: { user: { email?: string } | null } }) => {
      setEmail(data.user?.email ?? null);
      if (data.user) { const { count } = await sb.from("openings").select("id", { count: "exact", head: true }).eq("state", "new"); setFresh(count ?? 0); }
    });
  }, [path]);
  useEffect(() => { setMobileOpen(false); }, [path]);
  async function signOut() {
    await signOutEverywhere();
    router.push("/login");
  }
  return (
    <header className="nav"><nav className="nav-in" aria-label="Main">
      <Link href={email ? "/about" : "/"} className="brand"><span className="brand-mark" aria-hidden="true"><Icon name="door" /></span><span>Three Doors</span></Link>
      <div className="nav-links">
        {email && TABS.map(([h, l, i]) => <Link key={h} href={h} className={`tab${path.startsWith(h) ? " on" : ""}`} aria-current={path.startsWith(h) ? "page" : undefined} title={l}><Icon name={i} /><span className="lbl">{l}</span>{h === "/openings" && fresh > 0 && <span className="badge" aria-label={`${fresh} new`}>{fresh}</span>}</Link>)}
      </div>
      <span className="sp" />
      <div className="nav-actions">
        <Link href="/privacy" className={`tab${path === "/privacy" ? " on" : ""}`} title="How we handle data" aria-label="How we handle data"><Icon name="shield" /></Link>
        {email ? <button className="tab" style={{ border: 0, background: "none" }} onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
          : path !== "/login" && <Link href="/login" className="btn primary">Sign in</Link>}
      </div>
      {email && <>
        <button className="nav-menu-trigger" type="button" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen((open) => !open)}>
          <Icon name={mobileOpen ? "close" : "menu"} /><span>{mobileOpen ? "Close" : "Menu"}</span>
        </button>
        <div id="mobile-navigation" className="nav-mobile" hidden={!mobileOpen}>
          {TABS.map(([h, l, i]) => <Link key={h} href={h} className={`tab${path.startsWith(h) ? " on" : ""}`} aria-current={path.startsWith(h) ? "page" : undefined} onClick={() => setMobileOpen(false)}>
            <Icon name={i} /><span>{l}</span>{h === "/openings" && fresh > 0 && <span className="badge" aria-label={`${fresh} new`}>{fresh}</span>}
          </Link>)}
          <Link href="/privacy" className={`tab${path === "/privacy" ? " on" : ""}`} aria-current={path === "/privacy" ? "page" : undefined} onClick={() => setMobileOpen(false)}><Icon name="shield" /><span>Privacy</span></Link>
          <button className="tab" type="button" onClick={signOut}><Icon name="logout" /><span>Sign out</span></button>
        </div>
      </>}
    </nav></header>
  );
}
