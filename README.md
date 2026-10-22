# Claims Workflow Orchestrator

Starter TypeScript repository for the claims lifecycle workflow challenge.

## Structure

- `config/state-machine.json` defines lifecycle states, transitions, preconditions, side effects, and authorized roles.
- `backend/src/types/workflow.ts` contains the shared workflow domain types.
- `backend/src/config/loadStateMachineConfig.ts` loads and validates the JSON configuration.
- `backend/src/engine/StateMachineEngine.ts` validates transitions, preconditions, authorization, cycle limits, and appends audit entries.
- `frontend/` is reserved for the TypeScript user interface.

The configuration loader defaults to `config/state-machine.json` relative to the current working directory. Pass a file path to `loadStateMachineConfig(path)` to load another configuration.

## Build

Install the development dependencies and run `npm run build` to compile the backend TypeScript sources.

## Workflow engine

The engine is in-memory and provides `createClaim`, `updateFacts`, `getClaim`, `getValidTransitions`, `advance`, and `getAuditTrail`. Supply claim facts as upstream systems report them. The configured precondition check IDs are evaluated against these facts: document presence, assessor assignment, assessment completion, amount against policy limit, rejection reason, missing information, new information received, payment request, payment confirmation, and appeal expiry/member acknowledgment.

Example:

```ts
const engine = new StateMachineEngine();
engine.createClaim("CLM-1001", { documentsPresent: true }, 5000);
engine.advance({
  claimId: "CLM-1001",
  to: "DOCUMENTS_VERIFIED",
  actor: { userId: "clerk-7", role: "document_clerk" },
});
```

Set `MAX_INFO_REQUEST_CYCLES` in `.env` (default `3`). The setting counts successful transitions into `PENDING_INFO` per claim; the next attempt is rejected with the escalation message. Roles used by the challenge are `document_clerk`, `team_lead`, `assessor`, `finance`, and `system`.
