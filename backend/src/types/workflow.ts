export type StateName =
  | "SUBMITTED"
  | "DOCUMENTS_VERIFIED"
  | "UNDER_ASSESSMENT"
  | "PENDING_INFO"
  | "APPROVED"
  | "REJECTED"
  | "PAYMENT_INITIATED"
  | "CLOSED"
  /** Permit additional state names declared in a runtime workflow configuration. */
  | (string & {});

/** A role authorized to perform one or more configured transitions. */
export type Role =
  | "document_clerk"
  | "team_lead"
  | "assessor"
  | "finance"
  | "system";

export interface State {
  readonly name: StateName;
  readonly description: string;
}

export type PreconditionCheck =
  | "documents_present"
  | "assessor_assigned"
  | "assessment_report_complete"
  | "approved_amount_within_policy_limit"
  | "rejection_reason_provided"
  | "missing_info_description_provided"
  | "new_information_received"
  | "payment_request_created"
  | "payment_confirmed"
  | "appeal_period_expired_or_acknowledged";

export interface Precondition {
  readonly check: PreconditionCheck;
  readonly description: string;
}

export interface Transition {
  readonly from: StateName;
  readonly to: StateName;
  /** Human-readable requirements; runtime checks are supplied by the workflow engine. */
  readonly preconditions: readonly Precondition[];
  /** Human-readable effects; effect handlers are supplied by the workflow engine. */
  readonly sideEffects: readonly string[];
  readonly authorizedRoles: readonly Role[];
}

export interface AuditEntry {
  readonly timestamp: string;
  readonly claimId: string;
  readonly fromState: StateName;
  readonly toState: StateName;
  readonly triggeredBy: {
    readonly userId: string;
    readonly role: Role;
  };
  readonly reason?: string;
  readonly notes?: string;
}

export interface Claim {
  readonly id: string;
  readonly state: StateName;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly policyLimit?: number;
  readonly facts?: Readonly<ClaimFacts>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Facts supplied by claim intake, document, assessment, and payment workflows. */
export interface ClaimFacts {
  readonly documentsPresent?: boolean;
  readonly assessorAssigned?: boolean;
  readonly assessmentReportComplete?: boolean;
  readonly approvedAmount?: number;
  readonly rejectionReason?: string;
  readonly missingInfoDescription?: string;
  readonly newInformationReceived?: boolean;
  readonly paymentRequestCreated?: boolean;
  readonly paymentConfirmed?: boolean;
  readonly appealPeriodExpired?: boolean;
  readonly memberAcknowledged?: boolean;
}

export interface StateMachineConfig {
  readonly initialState: StateName;
  readonly states: readonly State[];
  readonly transitions: readonly Transition[];
}
