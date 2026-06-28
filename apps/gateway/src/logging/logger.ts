import type { FastifyServerOptions } from "fastify";

export function createLoggerOptions(level: string): FastifyServerOptions["logger"] {
  return {
    level,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-infohub-api-key",
      "req.headers.x-goog-iap-jwt-assertion",
      "req.headers.Authorization",
      "req.headers.authorization",
      "N8N_API_AUTH_HEADER_VALUE",
      "N8N_JWT_PRIVATE_KEY_PEM"
    ]
  };
}
