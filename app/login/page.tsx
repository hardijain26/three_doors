"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null); const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
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
    setBusy(false);
  }
  return (
    <form onSubmit={go} className="card stack" style={{ maxWidth: 420 }}>
      <h1>{mode === "in" ? "Sign in" : "Create your account"}</h1>
      <label className="f">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="f">Password<input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
      {msg && <div className={`msg${msg.err ? " err" : ""}`}>{msg.t}</div>}
      <button className="primary" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>{mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}</button>
    </form>
  );
}
