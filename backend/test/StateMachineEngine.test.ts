import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStateMachineConfig } from "../src/config/loadStateMachineConfig";
import {
  AuthorizationError,
  ClaimNotFoundError,
  InformationRequestLimitError,
  InvalidTransitionError,
  PreconditionFailedError,
  StateMachineEngine,
} from "../src/engine/StateMachineEngine";
import type { ClaimFacts, Role, StateMachineConfig, StateName } from "../src/types/workflow";

const actorByRole: Record<Role, string> = {
  document_clerk: "clerk-1",
  team_lead: "lead-1",
  assessor: "assessor-1",
  finance: "finance-1",
  system: "system",
};

function createEngine(options: ConstructorParameters<typeof StateMachineEngine>[0] = {}) {
  return new StateMachineEngine({
    config: loadStateMachineConfig(),
    maxInformationRequestCycles: 3,
    now: () => new Date("2026-01-02T03:04:05.000Z"),
    ...options,
  });
}

function move(
  engine: StateMachineEngine,
  claimId: string,
  to: StateName,
  role: Role,
  details: { reason?: string; notes?: string } = {},
) {
  return engine.advance({ claimId, to, actor: { userId: actorByRole[role], role }, ...details });
}

function startAssessment(engine: StateMachineEngine, claimId: string) {
  engine.updateFacts(claimId, { documentsPresent: true });
  move(engine, claimId, "DOCUMENTS_VERIFIED", "document_clerk");
  engine.updateFacts(claimId, { assessorAssigned: true });
  move(engine, claimId, "UNDER_ASSESSMENT", "team_lead");
}

function completePayment(engine: StateMachineEngine, claimId: string) {
  engine.updateFacts(claimId, {
    assessmentReportComplete: true,
    approvedAmount: 500,
  });
  move(engine, claimId, "APPROVED", "assessor");
  engine.updateFacts(claimId, { paymentRequestCreated: true });
  move(engine, claimId, "PAYMENT_INITIATED", "finance");
  engine.updateFacts(claimId, { paymentConfirmed: true });
  move(engine, claimId, "CLOSED", "finance");
}

describe("StateMachineEngine workflow paths", () => {
  let engine: StateMachineEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it("completes the happy path from submission through payment closure", () => {
    engine.createClaim("happy", {}, 1_000);
    startAssessment(engine, "happy");
    completePayment(engine, "happy");

    expect(engine.getClaim("happy").state).toBe("CLOSED");
    expect(engine.getAuditTrail("happy").map((entry) => [entry.fromState, entry.toState])).toEqual([
      ["SUBMITTED", "DOCUMENTS_VERIFIED"],
      ["DOCUMENTS_VERIFIED", "UNDER_ASSESSMENT"],
      ["UNDER_ASSESSMENT", "APPROVED"],
      ["APPROVED", "PAYMENT_INITIATED"],
      ["PAYMENT_INITIATED", "CLOSED"],
    ]);
  });

  it("completes the rejection path and closes after appeal acknowledgement", () => {
    engine.createClaim("rejected");
    startAssessment(engine, "rejected");
    engine.updateFacts("rejected", { assessmentReportComplete: true, rejectionReason: "Not covered" });
    move(engine, "rejected", "REJECTED", "assessor");
    engine.updateFacts("rejected", { memberAcknowledged: true });
    move(engine, "rejected", "CLOSED", "system");

    expect(engine.getClaim("rejected").state).toBe("CLOSED");
    expect(engine.getAuditTrail("rejected")).toHaveLength(4);
  });

  it("completes an information request loop within the configured limit", () => {
    engine.createClaim("info-loop", {}, 1_000);
    startAssessment(engine, "info-loop");
    engine.updateFacts("info-loop", { missingInfoDescription: "Please provide the receipt." });
    move(engine, "info-loop", "PENDING_INFO", "assessor");
    engine.updateFacts("info-loop", { newInformationReceived: true });
    move(engine, "info-loop", "DOCUMENTS_VERIFIED", "document_clerk");
    engine.updateFacts("info-loop", { assessorAssigned: true });
    move(engine, "info-loop", "UNDER_ASSESSMENT", "team_lead");
    completePayment(engine, "info-loop");

    expect(engine.getClaim("info-loop").state).toBe("CLOSED");
    expect(engine.getInformationRequestCycles("info-loop")).toBe(1);
    expect(engine.getAuditTrail("info-loop")).toHaveLength(8);
  });

  it("rejects a transition that is not configured from the current state", () => {
    engine.createClaim("invalid");

    expect(() => move(engine, "invalid", "APPROVED", "assessor")).toThrow(InvalidTransitionError);
    expect(engine.getClaim("invalid").state).toBe("SUBMITTED");
    expect(engine.getAuditTrail("invalid")).toHaveLength(0);
  });

  it("rejects a configured transition attempted by an unauthorized role", () => {
    engine.createClaim("unauthorized", { documentsPresent: true });

    expect(() => move(engine, "unauthorized", "DOCUMENTS_VERIFIED", "assessor"))
      .toThrow(AuthorizationError);
    expect(engine.getAuditTrail("unauthorized")).toHaveLength(0);
  });
});

describe("StateMachineEngine validation, audit, and effects", () => {
  it("rejects document verification when required documents are absent", () => {
    const engine = createEngine();
    engine.createClaim("no-docs");

    expect(() => move(engine, "no-docs", "DOCUMENTS_VERIFIED", "document_clerk"))
      .toThrow(PreconditionFailedError);
  });

  it("rejects assessment when no assessor is assigned", () => {
    const engine = createEngine();
    engine.createClaim("no-assessor", { documentsPresent: true });
    move(engine, "no-assessor", "DOCUMENTS_VERIFIED", "document_clerk");

    expect(() => move(engine, "no-assessor", "UNDER_ASSESSMENT", "team_lead"))
      .toThrow(PreconditionFailedError);
  });

  it("rejects approval before the assessment report is complete", () => {
    const engine = createEngine();
    engine.createClaim("no-report", {}, 1_000);
    startAssessment(engine, "no-report");
    engine.updateFacts("no-report", { approvedAmount: 100 });

    expect(() => move(engine, "no-report", "APPROVED", "assessor"))
      .toThrow(PreconditionFailedError);
  });

  it("rejects an approved amount above the policy limit", () => {
    const engine = createEngine();
    engine.createClaim("over-limit", {}, 100);
    startAssessment(engine, "over-limit");
    engine.updateFacts("over-limit", { assessmentReportComplete: true, approvedAmount: 101 });

    expect(() => move(engine, "over-limit", "APPROVED", "assessor"))
      .toThrow(PreconditionFailedError);
  });

  it("uses a supplied rejection reason to satisfy and persist the rejection precondition", () => {
    const engine = createEngine();
    engine.createClaim("reason-from-input", {
      documentsPresent: true,
      assessorAssigned: true,
      assessmentReportComplete: true,
    });
    move(engine, "reason-from-input", "DOCUMENTS_VERIFIED", "document_clerk");
    move(engine, "reason-from-input", "UNDER_ASSESSMENT", "team_lead");

    const rejected = move(engine, "reason-from-input", "REJECTED", "assessor", {
      reason: "The treatment is excluded by the policy.",
    });

    expect(rejected.state).toBe("REJECTED");
    expect(rejected.facts?.rejectionReason).toBe("The treatment is excluded by the policy.");
    expect(engine.getAuditTrail("reason-from-input").at(-1)?.reason)
      .toBe("The treatment is excluded by the policy.");
  });

  it("rejects an information request without a missing information description", () => {
    const engine = createEngine();
    engine.createClaim("no-info-description");
    startAssessment(engine, "no-info-description");

    expect(() => move(engine, "no-info-description", "PENDING_INFO", "assessor"))
      .toThrow(PreconditionFailedError);
  });

  it("rejects return from pending information until new information is recorded", () => {
    const engine = createEngine();
    engine.createClaim("no-new-info");
    startAssessment(engine, "no-new-info");
    engine.updateFacts("no-new-info", { missingInfoDescription: "Need a receipt." });
    move(engine, "no-new-info", "PENDING_INFO", "assessor");

    expect(() => move(engine, "no-new-info", "DOCUMENTS_VERIFIED", "document_clerk"))
      .toThrow(PreconditionFailedError);
  });

  it("rejects the fourth information request when the cycle limit is three", () => {
    const engine = createEngine({ maxInformationRequestCycles: 3 });
    engine.createClaim("cycle-limit");
    startAssessment(engine, "cycle-limit");

    for (let cycle = 0; cycle < 3; cycle += 1) {
      engine.updateFacts("cycle-limit", { missingInfoDescription: `Request ${cycle + 1}` });
      move(engine, "cycle-limit", "PENDING_INFO", "assessor");
      engine.updateFacts("cycle-limit", { newInformationReceived: true });
      move(engine, "cycle-limit", "DOCUMENTS_VERIFIED", "document_clerk");
      engine.updateFacts("cycle-limit", { assessorAssigned: true });
      move(engine, "cycle-limit", "UNDER_ASSESSMENT", "team_lead");
    }

    engine.updateFacts("cycle-limit", { missingInfoDescription: "Fourth request" });
    expect(() => move(engine, "cycle-limit", "PENDING_INFO", "assessor"))
      .toThrow(InformationRequestLimitError);
    expect(engine.getInformationRequestCycles("cycle-limit")).toBe(3);
    expect(engine.getClaim("cycle-limit").state).toBe("UNDER_ASSESSMENT");
  });

  it("loads the cycle limit from an env file and falls back to three", () => {
    const directory = mkdtempSync(join(tmpdir(), "workflow-cycle-limit-"));
    const envPath = join(directory, ".env");
    const previousValue = process.env.MAX_INFO_REQUEST_CYCLES;
    delete process.env.MAX_INFO_REQUEST_CYCLES;

    try {
      writeFileSync(envPath, "MAX_INFO_REQUEST_CYCLES=2\n");
      const configured = new StateMachineEngine({ config: loadStateMachineConfig(), envPath });
      const fallback = new StateMachineEngine({
        config: loadStateMachineConfig(),
        envPath: join(directory, "missing.env"),
      });

      expect(configured.getInformationRequestCycleLimit()).toBe(2);
      expect(fallback.getInformationRequestCycleLimit()).toBe(3);
    } finally {
      if (previousValue === undefined) delete process.env.MAX_INFO_REQUEST_CYCLES;
      else process.env.MAX_INFO_REQUEST_CYCLES = previousValue;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records accurate transition audit fields, including reason and notes", () => {
    const engine = createEngine();
    engine.createClaim("audit", { documentsPresent: true });
    move(engine, "audit", "DOCUMENTS_VERIFIED", "document_clerk", {
      reason: "Documents checked",
      notes: "Originals matched the submission.",
    });

    expect(engine.getAuditTrail("audit")).toEqual([{
      timestamp: "2026-01-02T03:04:05.000Z",
      claimId: "audit",
      fromState: "SUBMITTED",
      toState: "DOCUMENTS_VERIFIED",
      triggeredBy: { userId: "clerk-1", role: "document_clerk" },
      reason: "Documents checked",
      notes: "Originals matched the submission.",
    }]);
  });

  it("prevents mutation and deletion of returned audit entries and history", () => {
    const engine = createEngine();
    engine.createClaim("immutable-audit", { documentsPresent: true });
    move(engine, "immutable-audit", "DOCUMENTS_VERIFIED", "document_clerk");
    const trail = engine.getAuditTrail("immutable-audit");
    const entry = trail[0]!;

    expect(Object.isFrozen(trail)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.triggeredBy)).toBe(true);
    expect(Reflect.set(entry, "toState", "CLOSED")).toBe(false);
    expect(Reflect.deleteProperty(entry, "fromState")).toBe(false);
    expect(Reflect.deleteProperty(trail, "0")).toBe(false);
    expect(engine.getAuditTrail("immutable-audit")[0]?.toState).toBe("DOCUMENTS_VERIFIED");
  });

  it("does not append failed attempts to the audit history", () => {
    const engine = createEngine();
    engine.createClaim("audit-failures");
    expect(() => move(engine, "audit-failures", "APPROVED", "assessor"))
      .toThrow(InvalidTransitionError);
    expect(engine.getAuditTrail("audit-failures")).toHaveLength(0);
  });

  it("loads and executes a newly configured state and transition", () => {
    const base = loadStateMachineConfig();
    const customConfig: StateMachineConfig = {
      ...base,
      states: [...base.states, { name: "MANUAL_REVIEW", description: "Manual review queue." }],
      transitions: [...base.transitions, {
        from: "SUBMITTED",
        to: "MANUAL_REVIEW",
        preconditions: [],
        sideEffects: ["Notify the manual review team."],
        authorizedRoles: ["team_lead"],
      }],
    };
    const configDirectory = mkdtempSync(join(tmpdir(), "workflow-config-"));
    const configPath = join(configDirectory, "state-machine.json");
    writeFileSync(configPath, JSON.stringify(customConfig));
    const logger = vi.fn();
    const engine = createEngine({ config: loadStateMachineConfig(configPath), sideEffectLogger: logger });
    try {
      engine.createClaim("custom-state");
      expect(move(engine, "custom-state", "MANUAL_REVIEW", "team_lead").state).toBe("MANUAL_REVIEW");
      expect(engine.getAuditTrail("custom-state")[0]?.toState).toBe("MANUAL_REVIEW");
      expect(logger).toHaveBeenCalledWith(
        "[side-effect] [claim:custom-state] Notify the manual review team.",
      );
    } finally {
      rmSync(configDirectory, { recursive: true, force: true });
    }
  });

  it("logs all configured mock side effects after a successful transition", () => {
    const logger = vi.fn();
    const engine = createEngine({ sideEffectLogger: logger });
    engine.createClaim("effects", { documentsPresent: true });
    move(engine, "effects", "DOCUMENTS_VERIFIED", "document_clerk");

    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith("[side-effect] [claim:effects] Notify the assessor team.");
    expect(engine.getClaim("effects").state).toBe("DOCUMENTS_VERIFIED");
  });

  it("does not execute side effects when a precondition fails", () => {
    const logger = vi.fn();
    const engine = createEngine({ sideEffectLogger: logger });
    engine.createClaim("no-effects");

    expect(() => move(engine, "no-effects", "DOCUMENTS_VERIFIED", "document_clerk"))
      .toThrow(PreconditionFailedError);
    expect(logger).not.toHaveBeenCalled();
  });

  it("rejects duplicate claim IDs", () => {
    const engine = createEngine();
    engine.createClaim("duplicate");

    expect(() => engine.createClaim("duplicate")).toThrow('Claim "duplicate" already exists.');
  });

  it("throws a specific error when querying an unknown claim", () => {
    const engine = createEngine();

    expect(() => engine.getAuditTrail("missing")).toThrow(ClaimNotFoundError);
  });

  it("merges updated source facts into a new immutable claim snapshot", () => {
    const engine = createEngine();
    const initialFacts: ClaimFacts = { documentsPresent: false };
    engine.createClaim("facts", initialFacts);
    const updated = engine.updateFacts("facts", { documentsPresent: true });

    expect(updated.facts).toEqual({ documentsPresent: true });
    expect(Object.isFrozen(updated)).toBe(true);
    expect(Object.isFrozen(updated.facts)).toBe(true);
    expect(engine.getClaim("facts").facts?.documentsPresent).toBe(true);
  });
});
