# Claims workflow UI

The React + Vite + Tailwind UI and Fastify API run together from the repository root:

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the Fastify server on port `3001`. The server loads sample claims at startup and keeps workflow state and audit trails in memory. Mock side effects are written to the server console.

The API exposes `GET /api/claims`, `GET /api/claims/:claim_id`, and `POST /api/claims/:claim_id/transition`.

Build with `npm run build` and `npm run build:frontend`. Run the compiled API with `npm run start:backend`.
