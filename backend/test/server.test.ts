import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server";

describe("Fastify claims API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildServer({ logger: false });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("lists the sample claims loaded at server startup", async () => {
    const response = await app.inject({ method: "GET", url: "/api/claims" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(3);
    expect(response.json()[0]).toMatchObject({
      id: "CLM-2025-0814",
      memberId: "MBR-309482",
      state: "SUBMITTED",
    });
  });

  it("returns claim details, valid transitions, and audit history", async () => {
    const response = await app.inject({ method: "GET", url: "/api/claims/CLM-2025-0814" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      id: "CLM-2025-0814",
      memberId: "MBR-309482",
      amount: 4_850,
      state: "SUBMITTED",
      auditTrail: [],
    });
    expect(body.validTransitions[0].to).toBe("DOCUMENTS_VERIFIED");
  });

  it("accepts a transition and returns the updated state and audit record", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/claims/CLM-2025-0814/transition",
      payload: {
        to: "DOCUMENTS_VERIFIED",
        actor: { userId: "clerk-7", role: "document_clerk" },
        reason: "Documents reviewed",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.state).toBe("DOCUMENTS_VERIFIED");
    expect(body.auditTrail).toHaveLength(1);
    expect(body.auditTrail[0]).toMatchObject({
      fromState: "SUBMITTED",
      toState: "DOCUMENTS_VERIFIED",
      triggeredBy: { userId: "clerk-7", role: "document_clerk" },
      reason: "Documents reviewed",
    });
  });

  it("returns a workflow error when the transition actor is unauthorized", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/claims/CLM-2025-0814/transition",
      payload: {
        to: "DOCUMENTS_VERIFIED",
        actor: { userId: "assessor-1", role: "assessor" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("UNAUTHORIZED_ROLE");
  });

  it("uses the submitted reason to satisfy and persist a rejection precondition", async () => {
    const claimId = "CLM-2025-0814";
    await app.inject({
      method: "POST",
      url: `/api/claims/${claimId}/transition`,
      payload: { to: "DOCUMENTS_VERIFIED", actor: { userId: "clerk-7", role: "document_clerk" } },
    });
    await app.inject({
      method: "POST",
      url: `/api/claims/${claimId}/transition`,
      payload: { to: "UNDER_ASSESSMENT", actor: { userId: "lead-1", role: "team_lead" } },
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/claims/${claimId}/transition`,
      payload: {
        to: "REJECTED",
        actor: { userId: "assessor-1", role: "assessor" },
        reason: "The treatment is excluded by this policy.",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.state).toBe("REJECTED");
    expect(body.facts.rejectionReason).toBe("The treatment is excluded by this policy.");
    expect(body.auditTrail.at(-1).reason).toBe("The treatment is excluded by this policy.");
  });
});
