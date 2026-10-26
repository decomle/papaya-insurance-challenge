# Claims Workflow Orchestrator

Starter TypeScript repository for the claims lifecycle workflow challenge.

## Structure

- `config/state-machine.json` defines lifecycle states, transitions, preconditions, side effects, and authorized roles.
- `backend/src/types/workflow.ts` contains the shared workflow domain types.
- `backend/src/config/loadStateMachineConfig.ts` loads and validates the JSON configuration.
- `backend/src/engine/StateMachineEngine.ts` validates transitions, preconditions, authorization, cycle limits, appends audit entries, and provides the sample-claim factory.
- `backend/src/routes/claims.ts` maps the claims API endpoints to the workflow engine.
- `backend/src/server.ts` creates the Fastify app, registers routes, and starts listening.
- `frontend/` contains the React + Vite + Tailwind workflow interface and API hooks.

The configuration loader defaults to `config/state-machine.json` relative to the current working directory. Pass a file path to `loadStateMachineConfig(path)` to load another configuration.

## Build

Install the dependencies with `npm install`. Run `npm run dev` to start the Fastify API and Vite UI together. The UI is available at `http://localhost:5173`; the API listens on port `3001`.

Run `npm run build` to compile the backend, `npm run build:frontend` to build the UI, `npm run typecheck:frontend` to type-check its TypeScript, and `npm test` to run the suite.

The API provides `GET /api/claims`, `GET /api/claims/:claim_id`, and `POST /api/claims/:claim_id/transition`.

## Deliverables

- **State machine configuration:** [config/state-machine.json](./config/state-machine.json) defines the states, transitions, preconditions, side effects, and authorized roles.
- **Scenario results:** `npm test` runs the five required scenarios plus additional validation tests. The five scenarios pass: happy path reaches `CLOSED`; rejection path reaches `CLOSED`; information-request loop reaches `CLOSED` within the limit; `SUBMITTED → APPROVED` is rejected; and an unauthorized role is rejected. The suite currently contains 28 tests across `backend/test/StateMachineEngine.test.ts` and `backend/test/server.test.ts`.
- **Audit trail output:** The full transition history is returned in the `auditTrail` field by `GET /api/claims/:claim_id` and is visible in the UI. The engine tests verify its fields, immutability, and that failed transitions are not recorded.
- **AI conversation log:** [ai_conversion_log.md](./ai_conversion_log.md) contains the conversation transcript documenting how the project was developed with AI assistance. Raw conversion log can be found in [raw_codex_conversion_logs.zip](./raw_codex_conversion_logs.zip) 

### Requirement traceability

| Challenge requirement | Implementation and evidence |
|---|---|
| Config-driven states and transitions | `config/state-machine.json`; `backend/src/config/loadStateMachineConfig.ts` |
| Transition validation, preconditions, and role authorization | `backend/src/engine/StateMachineEngine.ts`; corresponding validation tests in `backend/test/StateMachineEngine.test.ts` |
| Side effects and immutable audit history | `backend/src/engine/StateMachineEngine.ts`; audit and side-effect tests in `backend/test/StateMachineEngine.test.ts` |
| Information-request cycle limit | `backend/src/engine/StateMachineEngine.ts`; cycle-limit test in `backend/test/StateMachineEngine.test.ts` |
| CLI/web interface and available transition roles | `backend/src/routes/claims.ts`; `frontend/` |
| Five required scenarios and minimum test count | `backend/test/StateMachineEngine.test.ts`; run with `npm test` |

## Persistence and restart behavior

This is a demonstration implementation: claims, workflow facts, and audit history are held in memory by the backend. They are reset when the backend process stops or restarts, so the demo claims return to their initial state and transitions made during the previous run are not retained. No database or file-based persistence is configured. Durable storage would be needed in a production deployment to preserve claims and audit history across restarts.

### Authentication note

The frontend's **Triggering user ID** and **User role** fields provide actor details for the demo and let you exercise role-based transition checks. They do not authenticate a user: the API currently receives these values directly from the request, so they represent caller-provided data.

In a production setup, the actor would represent the logged-in account verified by the server, with its user ID and role derived from the authenticated session or access token. The server should use that verified identity and role when authorizing the requested transition, rather than relying on values supplied by the client.

## Workflow engine

The engine provides `createClaim`, `updateFacts`, `getClaim`, `getValidTransitions`, `advance`, and `getAuditTrail`. Supply claim facts as upstream systems report them. The configured precondition check IDs are evaluated against these facts: document presence, assessor assignment, assessment completion, amount against policy limit, rejection reason, missing information, new information received, payment request, payment confirmation, and appeal expiry/member acknowledgment.

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

Set `MAX_INFO_REQUEST_CYCLES` in the root `.env` file to configure the per-claim information request limit. Copy `.env.example` as a starting point; if the setting is absent, the engine uses `3`. The value counts successful transitions into `PENDING_INFO` per claim; the next attempt is rejected with the escalation message. Roles used by the challenge are `document_clerk`, `team_lead`, `assessor`, `finance`, and `system`.
