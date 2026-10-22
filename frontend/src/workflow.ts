import workflowDefinition from "../../config/state-machine.json";
import type { ClaimRecord, Role, WorkflowConfig } from "./types";

export const config = workflowDefinition as WorkflowConfig;
export const roles: Role[] = ["document_clerk", "team_lead", "assessor", "finance", "system"];
export const maxInformationRequestCycles = 3;

export const sampleClaims: ClaimRecord[] = [
  {
    id: "CLM-2025-0814",
    memberId: "MBR-309482",
    amount: 4_850,
    policyLimit: 10_000,
    state: "SUBMITTED",
    facts: {
      documentsPresent: true,
      assessorAssigned: true,
      assessmentReportComplete: true,
      approvedAmount: 4_850,
      rejectionReason: "",
      missingInfoDescription: "A treatment invoice is required.",
      newInformationReceived: true,
      paymentRequestCreated: true,
      paymentConfirmed: true,
      memberAcknowledged: true,
    },
    informationRequestCycles: 0,
    audit: [],
  },
  {
    id: "CLM-2025-0815",
    memberId: "MBR-781025",
    amount: 2_200,
    policyLimit: 5_000,
    state: "UNDER_ASSESSMENT",
    facts: {
      documentsPresent: true,
      assessorAssigned: true,
      assessmentReportComplete: true,
      approvedAmount: 2_200,
      rejectionReason: "The treatment is outside the covered period.",
      missingInfoDescription: "Please provide the referral letter.",
      newInformationReceived: true,
      paymentRequestCreated: true,
      paymentConfirmed: true,
      memberAcknowledged: true,
    },
    informationRequestCycles: 1,
    audit: [],
  },
  {
    id: "CLM-2025-0816",
    memberId: "MBR-440196",
    amount: 7_600,
    policyLimit: 8_000,
    state: "PENDING_INFO",
    facts: {
      documentsPresent: true,
      assessorAssigned: true,
      assessmentReportComplete: true,
      approvedAmount: 7_600,
      rejectionReason: "Outside policy coverage.",
      missingInfoDescription: "Please provide the discharge summary.",
      newInformationReceived: true,
      paymentRequestCreated: true,
      paymentConfirmed: true,
      memberAcknowledged: true,
    },
    informationRequestCycles: 1,
    audit: [],
  },
];

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

export function checkPrecondition(check: string, claim: ClaimRecord) {
  const facts = claim.facts;
  switch (check) {
    case "documents_present": return facts.documentsPresent === true;
    case "assessor_assigned": return facts.assessorAssigned === true;
    case "assessment_report_complete": return facts.assessmentReportComplete === true;
    case "approved_amount_within_policy_limit":
      return typeof facts.approvedAmount === "number" && facts.approvedAmount <= claim.policyLimit;
    case "rejection_reason_provided": return typeof facts.rejectionReason === "string" && facts.rejectionReason.trim().length > 0;
    case "missing_info_description_provided": return typeof facts.missingInfoDescription === "string" && facts.missingInfoDescription.trim().length > 0;
    case "new_information_received": return facts.newInformationReceived === true;
    case "payment_request_created": return facts.paymentRequestCreated === true;
    case "payment_confirmed": return facts.paymentConfirmed === true;
    case "appeal_period_expired_or_acknowledged": return facts.appealPeriodExpired === true || facts.memberAcknowledged === true;
    default: return false;
  }
}
