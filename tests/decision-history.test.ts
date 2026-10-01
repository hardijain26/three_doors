import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionHistoryEntries, decisionHistoryEntry, type DecisionHistoryEvent } from "../lib/client/decision-history.ts";

const event = (event_type: string, payload: Record<string, unknown> = {}): DecisionHistoryEvent => ({
  id: "event-1",
  role_id: "role-1",
  event_type,
  source_type: null,
  source_id: null,
  payload,
  created_at: "2026-10-01T09:30:00.000Z",
});

test("application events are shown with user-facing labels", () => {
  assert.equal(decisionHistoryEntry(event("APPLICATION_STARTED"), [])?.title, "Application started");
  assert.equal(decisionHistoryEntry(event("APPLICATION_SUBMITTED"), [])?.title, "Application submitted");
});

test("contact status changes use the current contact label and transition", () => {
  const entry = decisionHistoryEntry(event("STATUS_CHANGED", {
    contact_id: "contact-1",
    from: "Request sent",
    to: "Accepted",
  }), [{ id: "contact-1", name: "Ari Patel", type: "hm", dept: null }]);

  assert.deepEqual(entry, {
    id: "event-1",
    title: "Connection request accepted",
    detail: "Ari Patel · Request sent → Accepted",
    createdAt: "2026-10-01T09:30:00.000Z",
  });
});

test("outreach companion events are omitted to avoid duplicate timeline entries", () => {
  assert.equal(decisionHistoryEntry(event("OUTREACH_STARTED", { status: "Request sent" }), []), null);
  assert.equal(decisionHistoryEntry(event("OUTREACH_RESPONSE", { status: "Accepted" }), []), null);
});

test("unsupported and malformed status events do not break history rendering", () => {
  assert.equal(decisionHistoryEntry(event("FUTURE_EVENT"), []), null);
  const entry = decisionHistoryEntry(event("STATUS_CHANGED", { to: 42 }), []);
  assert.equal(entry?.title, "Contact status updated");
  assert.equal(entry?.detail, null);
});

test("empty event history produces no timeline entries", () => {
  assert.deepEqual(decisionHistoryEntries("role-1", [], []), []);
});

test("history entries are isolated to the selected role even if results contain other roles", () => {
  const otherRole = { ...event("APPLICATION_SUBMITTED"), id: "other-event", role_id: "role-2" };
  const selectedRole = { ...event("APPLICATION_STARTED"), id: "selected-event" };
  const entries = decisionHistoryEntries("role-1", [otherRole, selectedRole], []);

  assert.deepEqual(entries.map((entry) => entry.id), ["selected-event"]);
  assert.equal(entries[0].title, "Application started");
});

test("archive history and both application milestones remain separate entries", () => {
  const entries = decisionHistoryEntries("role-1", [
    { ...event("APPLICATION_SUBMITTED"), created_at: "2026-10-02T09:30:00.000Z" },
    { ...event("APPLICATION_STARTED"), id: "event-2", created_at: "2026-10-01T09:30:00.000Z" },
    { ...event("ROLE_ARCHIVED"), id: "event-3", created_at: "2026-10-03T09:30:00.000Z" },
  ], []);

  assert.deepEqual(entries.map((entry) => entry.title), [
    "Application started",
    "Application submitted",
    "Role archived",
  ]);
});

test("events render oldest-first with deterministic ordering for matching timestamps", () => {
  const later = { ...event("APPLICATION_SUBMITTED"), id: "event-z", created_at: "2026-10-02T09:30:00.000Z" };
  const sameTimeSecond = { ...event("ROLE_ARCHIVED"), id: "event-b" };
  const sameTimeFirst = { ...event("APPLICATION_STARTED"), id: "event-a" };
  const entries = decisionHistoryEntries("role-1", [later, sameTimeSecond, sameTimeFirst], []);

  assert.deepEqual(entries.map((entry) => entry.title), [
    "Application started",
    "Role archived",
    "Application submitted",
  ]);
});