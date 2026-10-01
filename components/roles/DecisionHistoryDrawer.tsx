"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { decisionHistoryEntries, type DecisionHistoryContact, type DecisionHistoryEvent } from "@/lib/client/decision-history.ts";
import type { Role } from "@/lib/client/pipeline.ts";

type HistoryRole = Pick<Role, "id" | "company" | "title">;

type DecisionHistoryDrawerProps = {
  role: HistoryRole | null;
  contacts: readonly DecisionHistoryContact[];
  onClose: () => void;
};

export function DecisionHistoryDrawer({ role, contacts, onClose }: DecisionHistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [events, setEvents] = useState<DecisionHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (role && !dialog.open) dialog.showModal();
    else if (!role && dialog.open) dialog.close();
  }, [role?.id]);

  useEffect(() => {
    if (!role) {
      setEvents([]);
      setLoading(false);
      setError(false);
      return;
    }

    let current = true;
    setEvents([]);
    setError(false);
    setLoading(true);

    void supabaseBrowser()
      .from("decision_events")
      .select("id, role_id, event_type, source_type, source_id, payload, created_at")
      .eq("role_id", role.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .then(({ data, error: queryError }: { data: DecisionHistoryEvent[] | null; error: unknown }) => {
        if (!current) return;
        setEvents(data ?? []);
        setError(!!queryError);
        setLoading(false);
      })
      .catch(() => {
        if (!current) return;
        setEvents([]);
        setError(true);
        setLoading(false);
      });

    return () => { current = false; };
  }, [role?.id, retry]);

  const entries = role ? decisionHistoryEntries(role.id, events, contacts) : [];

  return (
    <dialog
      ref={dialogRef}
      className="decision-history-dialog"
      aria-labelledby="decision-history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {role && <>
        <header className="decision-history-header">
          <div>
            <h2 id="decision-history-title">Decision history</h2>
            <p className="meta">{role.company} · {role.title}</p>
          </div>
          <button className="iconbtn" type="button" aria-label="Close history" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="decision-history-content" aria-live="polite">
          {loading && <p className="meta" role="status">Loading history…</p>}
          {!loading && error && <div className="msg err" role="alert">
            <span>Could not load this role&apos;s history.</span>
            <button className="link" type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </div>}
          {!loading && !error && !entries.length && <p className="meta">No history recorded for this role yet.</p>}
          {!loading && !error && entries.length > 0 && <ol className="decision-history-list">
            {entries.map((entry) => (
              <li className="decision-history-item" key={entry.id}>
                <span className="decision-history-marker" aria-hidden="true" />
                <div className="decision-history-event">
                  <h3>{entry.title}</h3>
                  {entry.detail && <p className="meta">{entry.detail}</p>}
                  <time className="meta" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </div>
              </li>
            ))}
          </ol>}
        </div>
      </>}
    </dialog>
  );
}