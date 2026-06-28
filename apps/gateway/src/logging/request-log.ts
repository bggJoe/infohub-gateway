import type { FastifyInstance } from "fastify";
import type { AuthContext } from "../auth/auth-context";

declare module "fastify" {
  interface FastifyRequest {
    authContext?: AuthContext;
    errorCode?: string;
    n8nStatus?: number;
    startTimeMs?: number;
  }
}

export function registerRequestLogging(server: FastifyInstance): void {
  server.addHook("onRequest", async (request) => {
    request.startTimeMs = Date.now();
  });

  server.addHook("onResponse", async (request, reply) => {
    const durationMs = request.startTimeMs ? Date.now() - request.startTimeMs : undefined;

    request.log.info({
      request_id: request.id,
      method: request.method,
      path: request.routeOptions.url ?? request.url.split("?")[0],
      status_code: reply.statusCode,
      duration_ms: durationMs,
      user_email: request.authContext?.email,
      n8n_status: request.n8nStatus,
      error_code: request.errorCode
    });
  });
}
