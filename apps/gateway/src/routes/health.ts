import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(server: FastifyInstance): Promise<void> {
  server.get("/api/health", async () => ({
    ok: true,
    service: "infohub-gateway",
    version: "0.1.0"
  }));
}
