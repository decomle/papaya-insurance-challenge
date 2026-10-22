export type Role = "document_clerk" | "team_lead" | "assessor" | "finance" | "system";
export type WorkflowState = string;
export type Facts = Record<string, unknown>;

export type AuditEntry = {
  timestamp: string;
  claimId: string;
  fromState: WorkflowState;
  toState: WorkflowState;
  triggeredBy: { userId: string; role: Role };
  reason?: string;
  notes?: string;
};

export type ClaimSummary = {
  id: string;
  memberId: string;
  amount: number;
  policyLimit: number;
  state: WorkflowState;
};

export type TransitionPrecondition = {
  check: string;
  description: string;
  satisfied: boolean;
};

export type AvailableTransition = {
  to: WorkflowState;
  authorizedRoles: Role[];
  preconditions: TransitionPrecondition[];
};

export type ClaimDetails = ClaimSummary & {
  createdAt: string;
  updatedAt: string;
  facts?: Facts;
  informationRequestCycles: number;
  maxInformationRequestCycles: number;
  validTransitions: AvailableTransition[];
  auditTrail: AuditEntry[];
};

export type TransitionRequest = {
  to: WorkflowState;
  actor: { userId: string; role: Role };
  reason?: string;
  notes?: string;
};
