"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { decisionHistoryEntries, type DecisionHistoryContact, type DecisionHistoryEvent, type DecisionHistoryScope } from "@/lib/client/decision-history.ts";
import { typeLabel, type Role } from "@/lib/client/pipeline.ts";

type DrawerScope =
  | { kind: "role"; role: Pick<Role, "id" | "company" | "title">; contacts: readonly DecisionHistoryContact[] }
  | { kind: "contact"; role: Pick<Role, "id" | "company" | "title">; contactId: string; contact: DecisionHistoryContact };

type DecisionHistoryDrawerProps = {
  scope: DrawerScope | null;
  onClose: () => void;
};

export function DecisionHistoryDrawer({ scope, onClose }: DecisionHistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [events, setEvents] = useState<DecisionHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (scope && !dialog.open) dialog.showModal();
    else if (!scope && dialog.open) dialog.close();
  }, [scope?.kind, scope?.role.id, scope?.kind === "contact" ? scope.contactId : null]);

  useEffect(() => {
    if (!scope) {
      setEvents([]);
      setLoading(false);
      setError(false);
      return;
    }

    let current = true;
    setEvents([]);
    setError(false);
    setLoading(true);

    const baseQuery = supabaseBrowser()
      .from("decision_events")
      .select("id, role_id, event_type, source_type, source_id, payload, created_at")
      .eq("role_id", scope.role.id);
    const scopedQuery = scope.kind === "contact"
      ? baseQuery.eq("source_type", "contact").eq("source_id", scope.contactId)
      : baseQuery;

    void scopedQuery
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
  }, [scope?.kind, scope?.role.id, scope?.kind === "contact" ? scope.contactId : null, retry]);

  const contacts = scope?.kind === "role" ? scope.contacts ?? [] : scope?.contact ? [scope.contact] : [];
  const eventScope: DecisionHistoryScope | null = scope
    ? scope.kind === "role"
      ? { kind: "role", roleId: scope.role.id }
      : { kind: "contact", roleId: scope.role.id, contactId: scope.contactId }
    : null;
  const entries = eventScope ? decisionHistoryEntries(eventScope, events, contacts) : [];

  return (
    <dialog
      ref={dialogRef}
      className="decision-history-dialog"
      aria-labelledby="decision-history-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {scope && <>
        <header className="decision-history-header">
          <div>
            <h2 id="decision-history-title">Decision history</h2>
            <p className="meta">{scope.kind === "role" ? `${scope.role.company} · ${scope.role.title}` : `${scope.contact?.name?.trim() || (scope.contact ? typeLabel(scope.contact) : "Contact")} · ${scope.role.company} · ${scope.role.title}`}</p>
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
          {!loading && !error && !entries.length && <p className="meta">No history recorded for this {scope.kind === "role" ? "role" : "contact"} yet.</p>}
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