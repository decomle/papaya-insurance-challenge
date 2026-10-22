import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadStateMachineConfig } from "../config/loadStateMachineConfig";
import {
  AuditEntry,
  Claim,
  ClaimFacts,
  PreconditionCheck,
  Role,
  StateMachineConfig,
  StateName,
  Transition,
} from "../types/workflow";

export class WorkflowError extends Error {
  /** Creates a workflow error with a stable machine-readable code. */
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ClaimNotFoundError extends WorkflowError {
  /** Creates an error for a claim ID that is not stored by the engine. */
  constructor(claimId: string) {
    super(`Claim "${claimId}" does not exist.`, "CLAIM_NOT_FOUND");
  }
}

export class InvalidTransitionError extends WorkflowError {
  /** Creates an error for a transition that is not configured from the current state. */
  constructor(message: string) {
    super(message, "INVALID_TRANSITION");
  }
}

export class AuthorizationError extends WorkflowError {
  /** Creates an error when the actor's role is not allowed for a transition. */
  constructor(from: StateName, to: StateName, allowed: readonly Role[], actual: Role) {
    super(
      `Role "${actual}" is not authorized to transition ${from} → ${to}. Authorized role${allowed.length === 1 ? "" : "s"}: ${allowed.join(", ")}.`,
      "UNAUTHORIZED_ROLE",
    );
  }
}

export class PreconditionFailedError extends WorkflowError {
  /** Creates an error listing the preconditions that block a transition. */
  constructor(from: StateName, to: StateName, descriptions: readonly string[]) {
    super(
      `Cannot transition ${from} → ${to}; unmet precondition${descriptions.length === 1 ? "" : "s"}: ${descriptions.join("; ")}`,
      "PRECONDITION_FAILED",
    );
  }
}

export class InformationRequestLimitError extends WorkflowError {
  /** Creates an error raised when the configured information request limit is reached. */
  constructor(limit: number) {
    super(
      `Maximum information requests exceeded — escalate to team lead (limit: ${limit}).`,
      "MAX_INFO_REQUESTS_EXCEEDED",
    );
  }
}

export interface WorkflowActor {
  readonly userId: string;
  readonly role: Role;
}

export interface AdvanceClaimInput {
  readonly claimId: string;
  readonly to: StateName;
  readonly actor: WorkflowActor;
  readonly reason?: string;
  readonly notes?: string;
}

export interface AvailableTransition {
  readonly to: StateName;
  readonly authorizedRoles: readonly Role[];
  readonly preconditions: readonly {
    readonly check: PreconditionCheck;
    readonly description: string;
    readonly satisfied: boolean;
  }[];
}

export interface StateMachineEngineOptions {
  readonly config?: StateMachineConfig;
  readonly configPath?: string;
  readonly maxInformationRequestCycles?: number;
  readonly envPath?: string;
  readonly now?: () => Date;
  readonly sideEffectLogger?: (message: string) => void;
}

/** Reads and validates the information request cycle limit from the environment or an env file. */
function readCycleLimit(envPath = resolve(process.cwd(), ".env")): number {
  let fileValue: string | undefined;
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((entry) => /^\s*MAX_INFO_REQUEST_CYCLES\s*=/.test(entry));
    fileValue = line?.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  const raw = process.env.MAX_INFO_REQUEST_CYCLES ?? fileValue ?? "3";
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`MAX_INFO_REQUEST_CYCLES must be a non-negative integer; received "${raw}".`);
  }
  return limit;
}

/** Returns whether a value is a non-empty string after trimming whitespace. */
function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const sampleClaimSeeds = [
  { id: "CLM-2025-0814", memberId: "MBR-309482", amount: 4_850, policyLimit: 10_000 },
  { id: "CLM-2025-0815", memberId: "MBR-781025", amount: 2_200, policyLimit: 5_000 },
  { id: "CLM-2025-0816", memberId: "MBR-440196", amount: 7_600, policyLimit: 8_000 },
] as const;

const sampleClaimFacts: ClaimFacts = {
  documentsPresent: true,
  assessorAssigned: true,
  assessmentReportComplete: true,
  rejectionReason: "",
  missingInfoDescription: "A treatment invoice is required.",
  newInformationReceived: true,
  paymentRequestCreated: true,
  paymentConfirmed: true,
  memberAcknowledged: true,
};

/**
 * In-memory core workflow engine. Claims and audit entries are returned as
 * immutable snapshots; adapters can persist them in a database later.
 */
export class StateMachineEngine {
  private readonly config: StateMachineConfig;
  private readonly claims = new Map<string, Claim>();
  private readonly auditEntries = new Map<string, readonly AuditEntry[]>();
  private readonly informationRequestCycles = new Map<string, number>();
  private readonly maxInformationRequestCycles: number;
  private readonly now: () => Date;
  private readonly logSideEffect: (message: string) => void;

  /** Creates an engine using the supplied configuration and optional runtime dependencies. */
  constructor(options: StateMachineEngineOptions = {}) {
    this.config = options.config ?? loadStateMachineConfig(options.configPath);
    this.maxInformationRequestCycles = options.maxInformationRequestCycles ?? readCycleLimit(options.envPath);
    if (!Number.isInteger(this.maxInformationRequestCycles) || this.maxInformationRequestCycles < 0) {
      throw new Error("maxInformationRequestCycles must be a non-negative integer.");
    }
    this.now = options.now ?? (() => new Date());
    this.logSideEffect = options.sideEffectLogger ?? console.log;
  }

  /** Creates an engine populated with the demo claims used by the API and UI. */
  static withSampleClaims(options: StateMachineEngineOptions = {}): StateMachineEngine {
    const engine = new StateMachineEngine(options);
    for (const sample of sampleClaimSeeds) {
      engine.createClaim(
        sample.id,
        { ...sampleClaimFacts, approvedAmount: sample.amount },
        sample.policyLimit,
        { memberId: sample.memberId, amount: sample.amount },
      );
    }
    return engine;
  }

  /** Creates a claim in the configured initial state and initializes its audit history. */
  createClaim(
    id: string,
    facts: ClaimFacts = {},
    policyLimit?: number,
    metadata?: Readonly<Record<string, unknown>>,
  ): Claim {
    if (!hasText(id)) throw new Error("Claim id must be a non-empty string.");
    if (this.claims.has(id)) throw new Error(`Claim "${id}" already exists.`);
    const timestamp = this.now().toISOString();
    const claim = this.snapshotClaim({
      id,
      state: this.config.initialState,
      createdAt: timestamp,
      updatedAt: timestamp,
      facts,
      ...(policyLimit === undefined ? {} : { policyLimit }),
      ...(metadata === undefined ? {} : { metadata }),
    });
    this.claims.set(id, claim);
    this.auditEntries.set(id, Object.freeze([]));
    this.informationRequestCycles.set(id, 0);
    return claim;
  }

  /** Returns the immutable snapshot for a claim, or throws if it does not exist. */
  getClaim(claimId: string): Claim {
    const claim = this.claims.get(claimId);
    if (!claim) throw new ClaimNotFoundError(claimId);
    return claim;
  }

  /** Returns an immutable list of all claim snapshots currently held by the engine. */
  getClaims(): readonly Claim[] {
    return Object.freeze([...this.claims.values()]);
  }

  /** Update source facts as documents, assessment, or payment systems report progress. */
  updateFacts(claimId: string, facts: ClaimFacts): Claim {
    const claim = this.getClaim(claimId);
    return this.replaceClaim(claim, { ...claim.facts, ...facts });
  }

  /** Returns how many information requests have been issued for a claim. */
  getInformationRequestCycles(claimId: string): number {
    this.getClaim(claimId);
    return this.informationRequestCycles.get(claimId) ?? 0;
  }

  /** Returns the maximum number of information requests allowed per claim. */
  getInformationRequestCycleLimit(): number {
    return this.maxInformationRequestCycles;
  }

  /** Lists configured transitions from the claim's current state and their precondition status. */
  getValidTransitions(claimId: string): readonly AvailableTransition[] {
    const claim = this.getClaim(claimId);
    return Object.freeze(
      this.config.transitions
        .filter((transition) => transition.from === claim.state)
        .map((transition) => Object.freeze({
          to: transition.to,
          authorizedRoles: Object.freeze([...transition.authorizedRoles]),
          preconditions: Object.freeze(
            transition.preconditions.map((precondition) => Object.freeze({
              check: precondition.check,
              description: precondition.description,
              satisfied: this.evaluate(precondition.check, claim),
            })),
          ),
        })),
    );
  }

  /** Validates and applies a transition, records its audit entry, and runs configured side effects. */
  advance(input: AdvanceClaimInput): Claim {
    const claim = this.getClaim(input.claimId);
    const transition = this.config.transitions.find(
      (candidate) => candidate.from === claim.state && candidate.to === input.to,
    );
    if (!transition) {
      const available = this.config.transitions
        .filter((candidate) => candidate.from === claim.state)
        .map((candidate) => candidate.to);
      const options = available.length > 0 ? available.join(", ") : "none (this state is terminal)";
      throw new InvalidTransitionError(
        `Cannot transition claim "${claim.id}" from ${claim.state} to ${input.to}: no such transition is configured. Allowed next states: ${options}.`,
      );
    }

    if (!transition.authorizedRoles.includes(input.actor.role)) {
      throw new AuthorizationError(claim.state, input.to, transition.authorizedRoles, input.actor.role);
    }

    const cycles = this.informationRequestCycles.get(claim.id) ?? 0;
    if (input.to === "PENDING_INFO" && cycles >= this.maxInformationRequestCycles) {
      throw new InformationRequestLimitError(this.maxInformationRequestCycles);
    }
    if (claim.state === "DOCUMENTS_VERIFIED" && input.to === "UNDER_ASSESSMENT" &&
        cycles > this.maxInformationRequestCycles) {
      throw new InformationRequestLimitError(this.maxInformationRequestCycles);
    }

    const rejectionReason = input.to === "REJECTED" && hasText(input.reason) ? input.reason.trim() : undefined;
    const claimForChecks = rejectionReason
      ? { ...claim, facts: { ...claim.facts, rejectionReason } }
      : claim;
    const unmet = transition.preconditions
      .filter((precondition) => !this.evaluate(precondition.check, claimForChecks))
      .map((precondition) => precondition.description);
    if (unmet.length > 0) throw new PreconditionFailedError(claim.state, input.to, unmet);

    const timestamp = this.now().toISOString();
    const nextClaim = this.snapshotClaim({
      ...claim,
      ...(rejectionReason ? { facts: { ...claim.facts, rejectionReason } } : {}),
      state: input.to,
      updatedAt: timestamp,
    });
    const auditEntry: AuditEntry = Object.freeze({
      timestamp,
      claimId: claim.id,
      fromState: claim.state,
      toState: input.to,
      triggeredBy: Object.freeze({ userId: input.actor.userId, role: input.actor.role }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    });

    // Commit state and audit as one synchronous operation, then run mock effects.
    this.claims.set(claim.id, nextClaim);
    const history = this.auditEntries.get(claim.id) ?? Object.freeze([]);
    this.auditEntries.set(claim.id, Object.freeze([...history, auditEntry]));
    if (input.to === "PENDING_INFO") {
      this.informationRequestCycles.set(claim.id, cycles + 1);
    }
    this.executeSideEffects(claim.id, transition.sideEffects);
    return nextClaim;
  }

  /** Returns an immutable copy of the claim's audit history. */
  getAuditTrail(claimId: string): readonly AuditEntry[] {
    this.getClaim(claimId);
    return this.auditEntries.get(claimId) ?? Object.freeze([]);
  }

  /** Logs each configured mock side effect after the transition has been committed. */
  private executeSideEffects(claimId: string, sideEffects: readonly string[]): void {
    for (const effect of sideEffects) {
      this.logSideEffect(`[side-effect] [claim:${claimId}] ${effect}`);
    }
  }

  /** Replaces a stored claim after updating its facts and timestamp. */
  private replaceClaim(claim: Claim, facts: ClaimFacts): Claim {
    const updated = this.snapshotClaim({ ...claim, facts, updatedAt: this.now().toISOString() });
    this.claims.set(claim.id, updated);
    return updated;
  }

  /** Copies and freezes claim data so callers cannot mutate engine state. */
  private snapshotClaim(claim: Claim): Claim {
    return Object.freeze({
      ...claim,
      ...(claim.facts ? { facts: Object.freeze({ ...claim.facts }) } : {}),
      ...(claim.metadata ? { metadata: Object.freeze({ ...claim.metadata }) } : {}),
    });
  }

  /** Evaluates one configured precondition against the claim's current facts. */
  private evaluate(check: PreconditionCheck, claim: Claim): boolean {
    const facts = claim.facts ?? {};
    switch (check) {
      case "documents_present":
        return facts.documentsPresent === true;
      case "assessor_assigned":
        return facts.assessorAssigned === true;
      case "assessment_report_complete":
        return facts.assessmentReportComplete === true;
      case "approved_amount_within_policy_limit":
        return typeof facts.approvedAmount === "number" && Number.isFinite(facts.approvedAmount) &&
          typeof claim.policyLimit === "number" && Number.isFinite(claim.policyLimit) &&
          facts.approvedAmount <= claim.policyLimit;
      case "rejection_reason_provided":
        return hasText(facts.rejectionReason);
      case "missing_info_description_provided":
        return hasText(facts.missingInfoDescription);
      case "new_information_received":
        return facts.newInformationReceived === true;
      case "payment_request_created":
        return facts.paymentRequestCreated === true;
      case "payment_confirmed":
        return facts.paymentConfirmed === true;
      case "appeal_period_expired_or_acknowledged":
        return facts.appealPeriodExpired === true || facts.memberAcknowledged === true;
    }
  }
}

/** Make the configured transition explicit in type-level API documentation. */
export type ConfiguredTransition = Transition;
