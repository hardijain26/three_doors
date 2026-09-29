"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { wipeBrowserVault } from "@/lib/client/browser-vault.ts";
import { Icon } from "@/components/icons.tsx";

type Social = { id: "google" | "linkedin_oidc"; label: string; icon: React.ReactNode };
const SOCIAL: Social[] = [
  { id: "google", label: "Continue with Google", icon: <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> },
  { id: "linkedin_oidc", label: "Continue with LinkedIn", icon: <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#0A66C2"/><path fill="#fff" d="M7.1 9.5H4.6V19h2.5V9.5zM5.9 5a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9zM19.4 13.6c0-2.6-.6-4.3-3.4-4.3-1.4 0-2.3.7-2.7 1.4V9.5h-2.4V19h2.5v-4.7c0-1.2.2-2.4 1.8-2.4s1.6 1.5 1.6 2.5V19h2.6v-5.4z"/></svg> },
];

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null); const [busy, setBusy] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const err = new URLSearchParams(location.search).get("error");
    if (err) setMsg({ t: "That sign-in didn't complete. Try again, or use email and password.", err: true });
    // Supabase publishes which sign-in providers are switched on; only show those.
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } })
      .then((r) => r.json()).then((j) => setEnabled(j?.external ?? {})).catch(() => {});
  }, []);

  async function social(p: Social["id"]) {
    setBusy(p); setMsg(null);
    await wipeBrowserVault(); // a new sign-in never inherits another account's browser keys
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: p, options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) { setMsg({ t: "Couldn't start that sign-in. Try again.", err: true }); setBusy(""); }
  }

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy("email"); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg({ t: error.message === "Email not confirmed" ? "Confirm your email first: open the link we sent, then sign in here." : "Email or password is wrong.", err: true });
      else router.push("/roles");
    } else {
      const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      if (error) setMsg({ t: error.message, err: true });
      else if (data.session) router.push("/settings/ai");
      else setMsg({ t: "Check your inbox and click the confirmation link. Then come back and sign in." });
    }
    setBusy("");
  }

  // Providers listed in NEXT_PUBLIC_AUTH_PROVIDERS always show (default: Google).
  // Any other provider shows once Supabase reports it switched on.
  const always = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "google").split(",").map((x) => x.trim());
  const socials = SOCIAL.filter((s) => always.includes(s.id) || enabled[s.id]);
  return (
    <div className="auth">
      <aside className="auth-side">
        <span className="brand-mark" style={{ background: "var(--on-primary)", color: "var(--primary)" }} aria-hidden="true"><Icon name="door" /></span>
        <h2>Three people per role. One place to track them.</h2>
        <ul>
          <li><Icon name="briefcase" /><span>Hiring manager, recruiter, and someone who can refer you</span></li>
          <li><Icon name="sparkles" /><span>Notes and follow-ups drafted by your own AI</span></li>
          <li><Icon name="lock" /><span>Your key and your data stay yours</span></li>
        </ul>
      </aside>
      <div className="auth-main stack">
      <h1>{mode === "in" ? "Welcome back" : "Create your account"}</h1>
      <p className="meta">{mode === "in" ? "Sign in to pick up where you left off." : "Free to use. You bring your own AI key."}</p>
      {socials.length > 0 && <>
        {socials.map((s) => <button key={s.id} type="button" className="social block" disabled={!!busy} onClick={() => social(s.id)}>{s.icon}<span>{busy === s.id ? "Redirecting…" : s.label}</span></button>)}
        <div className="or"><span>or with email</span></div>
      </>}
      <form onSubmit={go} className="stack">
        <label className="f">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="f">Password<input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        {msg && <div className={`msg${msg.err ? " err" : ""}`}>{msg.t}</div>}
        <button className="primary block" disabled={!!busy}>{busy === "email" ? <span className="spin" aria-label="Working" /> : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>{mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}</button>
      {socials.length > 0 && <p className="hint">Signing in with Google or LinkedIn shares only your name, email and profile photo with Three Doors. We can't post or read your connections.</p>}
      </div>
    </div>
  );
}
