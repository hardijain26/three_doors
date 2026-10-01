import { type Contact, typeLabel } from "./pipeline.ts";

export type DecisionHistoryEvent = {
  id: string;
  role_id: string;
  event_type: string;
  source_type: string | null;
  source_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type DecisionHistoryContact = Pick<Contact, "id" | "name" | "type" | "dept">;

export type DecisionHistoryEntry = {
  id: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

const STATUS_TITLES: Record<string, string> = {
  Found: "Contact identified",
  "Request sent": "Connection request sent",
  Accepted: "Connection request accepted",
  Messaged: "Follow-up message sent",
  Replied: "Contact replied",
  "Coffee chat": "Coffee chat completed",
  "Referral given": "Referral received",
  Closed: "Contact marked closed",
};

export function decisionHistoryEntry(
  event: DecisionHistoryEvent,
  contacts: readonly DecisionHistoryContact[],
): DecisionHistoryEntry | null {
  const payload = event.payload ?? {};
  let title: string;
  let detail: string | null = null;

  switch (event.event_type) {
    case "ROLE_CONFIRMED":
      title = "Role added to your tracker";
      break;
    case "APPLICATION_STARTED":
      title = "Application started";
      break;
    case "APPLICATION_SUBMITTED":
      title = "Application submitted";
      break;
    case "ROLE_ARCHIVED":
      title = "Role archived";
      break;
    case "STATUS_CHANGED": {
      const contactId = typeof payload.contact_id === "string" ? payload.contact_id : event.source_id;
      const contact = contacts.find((item) => item.id === contactId);
      const from = typeof payload.from === "string" ? payload.from : "";
      const to = typeof payload.to === "string" ? payload.to : "";
      const contactName = contact?.name?.trim() || (contact ? typeLabel(contact) : "Contact");
      const transition = from && to ? `${from} → ${to}` : to;
      title = STATUS_TITLES[to] ?? "Contact status updated";
      detail = transition ? `${contactName} · ${transition}` : null;
      break;
    }
    // These are recorded alongside STATUS_CHANGED for the same transition.
    case "OUTREACH_STARTED":
    case "OUTREACH_RESPONSE":
    default:
      return null;
  }

  return { id: event.id, title, detail, createdAt: event.created_at };
}

export function decisionHistoryEntries(
  roleId: string,
  events: readonly DecisionHistoryEvent[],
  contacts: readonly DecisionHistoryContact[],
): DecisionHistoryEntry[] {
  return events
    .filter((event) => event.role_id === roleId)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .map((event) => decisionHistoryEntry(event, contacts))
    .filter((entry): entry is DecisionHistoryEntry => entry !== null);
}