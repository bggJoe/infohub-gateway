import type { FastifyInstance } from "fastify";

export function registerSecurityHeaders(server: FastifyInstance): void {
  server.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });
}
