import Fastify, { type FastifyInstance } from "fastify";
import claimsRoutes from "./routes/claims";
import type { StateMachineConfig } from "./types/workflow";

/** Creates the Fastify app and registers its route modules. */
export function buildServer(options: {
  logger?: boolean;
  config?: StateMachineConfig;
} = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  app.register(claimsRoutes, { config: options.config });
  return app;
}

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ host: "0.0.0.0", port });
}

if (require.main === module) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
