export type Role = "document_clerk" | "team_lead" | "assessor" | "finance" | "system";
export type WorkflowState = string;
export type Facts = Record<string, unknown>;

export type WorkflowConfig = {
  initialState: WorkflowState;
  states: { name: WorkflowState; description: string }[];
  transitions: WorkflowTransition[];
};

export type WorkflowTransition = {
  from: WorkflowState;
  to: WorkflowState;
  preconditions: { check: string; description: string }[];
  sideEffects: string[];
  authorizedRoles: Role[];
};

export type AuditEntry = {
  timestamp: string;
  fromState: WorkflowState;
  toState: WorkflowState;
  userId: string;
  role: Role;
  reason: string;
};

export type ClaimRecord = {
  id: string;
  memberId: string;
  amount: number;
  policyLimit: number;
  state: WorkflowState;
  facts: Facts;
  informationRequestCycles: number;
  audit: AuditEntry[];
};
