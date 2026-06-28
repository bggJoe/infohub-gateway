import Fastify from "fastify";
import { loadConfig, type AppConfig } from "./config";
import { AuthError } from "./auth/auth-context";
import { N8nClientError } from "./clients/n8n-client";
import { createLoggerOptions } from "./logging/logger";
import { registerRequestLogging } from "./logging/request-log";
import { registerActionItemsRoute } from "./routes/action-items";
import { registerHealthRoute } from "./routes/health";
import { registerSecurityHeaders } from "./security/headers";
import { ValidationError } from "./security/validation";

type ErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export async function buildServer(config: AppConfig = loadConfig()) {
  const server = Fastify({
    logger: createLoggerOptions(config.logLevel),
    requestIdHeader: "x-request-id"
  });

  registerSecurityHeaders(server);
  registerRequestLogging(server);
  await registerHealthRoute(server);
  await registerActionItemsRoute(server, config);

  server.setNotFoundHandler(async (_request, reply) => {
    return reply.status(404).send(errorResponse("NOT_FOUND", "Not found"));
  });

  server.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AuthError) {
      request.errorCode = error.code;
      request.log.warn({ error_code: error.code }, error.message);
      return reply.status(error.statusCode).send(errorResponse(error.code, error.message));
    }

    if (error instanceof ValidationError) {
      request.errorCode = "BAD_REQUEST";
      request.log.warn({ error_code: "BAD_REQUEST" }, error.message);
      return reply.status(400).send(errorResponse("BAD_REQUEST", error.message));
    }

    if (error instanceof N8nClientError) {
      request.errorCode = error.code;
      request.n8nStatus = error.upstreamStatus;
      request.log.warn({ error_code: error.code }, error.message);
      return reply.status(error.statusCode).send(errorResponse(error.code, safeUpstreamMessage(error.code)));
    }

    request.errorCode = "INTERNAL_ERROR";
    request.log.error({ error_code: "INTERNAL_ERROR" }, "Unhandled error");
    return reply.status(500).send(errorResponse("INTERNAL_ERROR", "Internal server error"));
  });

  return server;
}

function safeUpstreamMessage(code: N8nClientError["code"]): string {
  if (code === "N8N_TIMEOUT") {
    return "Upstream request timed out";
  }
  return "Upstream request failed";
}

function errorResponse(code: string, message: string): ErrorPayload {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

if (require.main === module) {
  const config = loadConfig();
  buildServer(config)
    .then((server) =>
      server.listen({
        host: "0.0.0.0",
        port: config.port
      })
    )
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
