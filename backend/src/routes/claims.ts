import type { FastifyError, FastifyPluginAsync } from "fastify";
import { loadStateMachineConfig } from "../config/loadStateMachineConfig";
import {
  ClaimNotFoundError,
  StateMachineEngine,
  WorkflowError,
} from "../engine/StateMachineEngine";
import type { Role, StateMachineConfig, StateName } from "../types/workflow";

type ClaimsRouteOptions = {
  config?: StateMachineConfig;
};

type TransitionBody = {
  to: StateName;
  actor: { userId: string; role: Role };
  reason?: string;
  notes?: string;
};

/** Registers claim API endpoints against the workflow engine. */
const claimsRoutes: FastifyPluginAsync<ClaimsRouteOptions> = async (app, options) => {
  const config = options.config ?? loadStateMachineConfig();
  const engine = StateMachineEngine.withSampleClaims({ config });

  function getClaimMetadata(metadata: Readonly<Record<string, unknown>> | undefined) {
    const memberId = metadata?.memberId;
    const amount = metadata?.amount;
    if (typeof memberId !== "string" || typeof amount !== "number") {
      throw new Error("Claim metadata is missing its member ID or amount.");
    }
    return { memberId, amount };
  }

  function getClaimDetails(claimId: string) {
    const claim = engine.getClaim(claimId);
    return {
      ...claim,
      ...getClaimMetadata(claim.metadata),
      informationRequestCycles: engine.getInformationRequestCycles(claimId),
      maxInformationRequestCycles: engine.getInformationRequestCycleLimit(),
      validTransitions: engine.getValidTransitions(claimId),
      auditTrail: engine.getAuditTrail(claimId),
    };
  }

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof WorkflowError) {
      const statusCode = error instanceof ClaimNotFoundError ? 404 : 400;
      return reply.code(statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error.validation) {
      return reply.code(400).send({
        error: { code: "INVALID_REQUEST", message: error.message },
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected server error occurred." },
    });
  });

  app.get("/api/claims", () => engine.getClaims().map((claim) => ({
    id: claim.id,
    ...getClaimMetadata(claim.metadata),
    policyLimit: claim.policyLimit,
    state: claim.state,
  })));

  app.get<{ Params: { claim_id: string } }>("/api/claims/:claim_id", (request) => {
    return getClaimDetails(request.params.claim_id);
  });

  app.post<{ Params: { claim_id: string }; Body: TransitionBody }>("/api/claims/:claim_id/transition", {
    schema: {
      body: {
        type: "object",
        required: ["to", "actor"],
        additionalProperties: false,
        properties: {
          to: { type: "string", minLength: 1 },
          actor: {
            type: "object",
            required: ["userId", "role"],
            additionalProperties: false,
            properties: {
              userId: { type: "string", minLength: 1 },
              role: { type: "string", enum: ["document_clerk", "team_lead", "assessor", "finance", "system"] },
            },
          },
          reason: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  }, (request) => {
    engine.advance({ claimId: request.params.claim_id, ...request.body });
    return getClaimDetails(request.params.claim_id);
  });
};

export default claimsRoutes;
