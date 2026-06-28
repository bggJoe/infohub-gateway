import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config";
import { authenticateDevUser } from "./dev-auth";
import { authenticateIapUser } from "./verify-iap";

export type AuthContext = {
  email: string;
  subject?: string;
  mode: "dev" | "iap";
};

export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: "AUTH_REQUIRED" | "AUTH_INVALID" | "FORBIDDEN";

  constructor(code: AuthError["code"], message: string, statusCode: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function authenticateRequest(
  request: FastifyRequest,
  config: AppConfig
): Promise<AuthContext> {
  if (config.authMode === "dev") {
    return authenticateDevUser(config);
  }

  return authenticateIapUser(request, config);
}
