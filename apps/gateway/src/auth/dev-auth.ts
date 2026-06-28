import type { AppConfig } from "../config";
import type { AuthContext } from "./auth-context";
import { AuthError } from "./auth-context";
import { isAllowedUser } from "./allowlist";

export function authenticateDevUser(config: AppConfig): AuthContext {
  if (!config.devUserEmail) {
    throw new AuthError("AUTH_REQUIRED", "Authentication required", 401);
  }

  if (!isAllowedUser(config.devUserEmail, config.allowedUsers)) {
    throw new AuthError("FORBIDDEN", "Forbidden", 403);
  }

  return {
    email: config.devUserEmail,
    mode: "dev"
  };
}
