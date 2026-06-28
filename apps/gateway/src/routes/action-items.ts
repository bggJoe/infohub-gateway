import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import { requireN8nConfig } from "../config";
import { authenticateRequest } from "../auth/auth-context";
import { N8nClient } from "../clients/n8n-client";
import { redactActionItems } from "../security/redaction";
import { validateActionItemsQuery } from "../security/validation";

export async function registerActionItemsRoute(
  server: FastifyInstance,
  config: AppConfig
): Promise<void> {
  server.get("/api/action-items", async (request) => {
    const auth = await authenticateRequest(request, config);
    request.authContext = auth;

    const filters = validateActionItemsQuery(request.query as Record<string, unknown>);
    const client = new N8nClient(requireN8nConfig(config));
    const result = await client.fetchActionItems(filters, {
      auth,
      method: request.method,
      path: "/api/action-items"
    });
    request.n8nStatus = result.status;

    const data = redactActionItems(result.rows);

    return {
      ok: true,
      count: data.length,
      filters: {
        ...filters,
        action_required: true
      },
      data
    };
  });
}
