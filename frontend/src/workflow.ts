import type { Role } from "./types";

export const roles: Role[] = ["document_clerk", "team_lead", "assessor", "finance", "system"];

export const roleLabels: Record<Role, string> = {
  document_clerk: "Document clerk",
  team_lead: "Team lead",
  assessor: "Assessor",
  finance: "Finance",
  system: "System",
};

const stateLabels: Record<string, string> = {
  SUBMITTED: "Submitted",
  DOCUMENTS_VERIFIED: "Documents verified",
  UNDER_ASSESSMENT: "Under assessment",
  PENDING_INFO: "Pending information",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAYMENT_INITIATED: "Payment initiated",
  CLOSED: "Closed",
};

export function stateLabel(state: string) {
  return stateLabels[state] ?? state.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
