
"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { Icon } from "@/components/icons.tsx";

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const sb = supabaseBrowser();

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await sb.from("profiles").select("linkedin_url").eq("id", data.user.id).single();
      if (!profile?.linkedin_url) {
        setIsOpen(true);
      }
    });
  }, []);

  async function handleEnrich() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      // 1. Save the URL to the profile first
      const { data: { user } } = await sb.auth.getUser();
      await sb.from("profiles").update({ linkedin_url: url.trim() }).eq("id", user?.id);
      
      // 2. Trigger the AI enrichment
      const res = await fetch("/api/ai/enrich-profile", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ linkedin_url: url.trim() }) 
      });

      if (res.ok) {
        setIsOpen(false);
      } else {
        alert("AI enrichment failed, but your URL was saved. You can fill in the rest in settings.");
        setIsOpen(false);
      }
    } catch (e) {
      alert("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card stack" style={{ maxWidth: 400, padding: 24, textAlign: 'center' }}>
        <Icon name="sparkles" style={{ fontSize: 32, marginBottom: 12 }} />
        <h2>Welcome to Three Doors</h2>
        <p className="hint">To personalize your AI outreach, we need your LinkedIn profile. Our AI will analyze your experience and fill in your profile automatically.</p>
        <div className="stack" style={{ gap: 12, marginTop: 16 }}>
          <label className="f">LinkedIn URL<input value={url} placeholder="https://linkedin.com/in/your-name" onChange={(e) => setUrl(e.target.value)} /></label>
          <button className="primary" disabled={busy || !url} onClick={handleEnrich}>
            {busy ? "AI is analyzing..." : "Build my profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
