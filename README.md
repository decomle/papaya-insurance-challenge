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

The API provides `GET /api/claims`, `GET /api/claims/:claim_id`, and `POST /api/claims/:claim_id/transition`. Workflow data is in memory and resets when the server restarts.

### Authentication note

The frontend's **Triggering user ID** and **User role** fields provide actor details for the demo and let you exercise role-based transition checks. They do not authenticate a user: the API currently receives these values directly from the request, so they represent caller-provided data.

In a production setup, the actor would represent the logged-in account verified by the server, with its user ID and role derived from the authenticated session or access token. The server would use that verified identity and role when authorizing the requested transition, rather than relying on values supplied by the client.

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

Set `MAX_INFO_REQUEST_CYCLES` in the root `.env` file to configure the per-claim information request limit. Copy `.env.example` as a starting point; if the setting is absent, the engine uses `3`. The value counts successful transitions into `PENDING_INFO` per claim; the next attempt is rejected with the escalation message. Roles used by the challenge are `document_clerk`, `team_lead`, `assessor`, `finance`, and `system`.
