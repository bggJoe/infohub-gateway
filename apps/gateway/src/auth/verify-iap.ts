import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppConfig } from "../config";
import type { AuthContext } from "./auth-context";
import { AuthError } from "./auth-context";
import { isAllowedUser } from "./allowlist";

const IAP_ISSUER = "https://cloud.google.com/iap";
const IAP_JWKS_URL = new URL("https://www.gstatic.com/iap/verify/public_key-jwk");
const jwks = createRemoteJWKSet(IAP_JWKS_URL);

function getHeaderValue(request: FastifyRequest, headerName: string): string | undefined {
  const value = request.headers[headerName.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export async function authenticateIapUser(
  request: FastifyRequest,
  config: AppConfig
): Promise<AuthContext> {
  if (!config.iapAudience) {
    throw new AuthError("AUTH_INVALID", "Authentication configuration is invalid", 401);
  }

  const assertion = getHeaderValue(request, "x-goog-iap-jwt-assertion");
  if (!assertion) {
    throw new AuthError("AUTH_REQUIRED", "Authentication required", 401);
  }

  try {
    const result = await jwtVerify(assertion, jwks, {
      issuer: IAP_ISSUER,
      audience: config.iapAudience,
      algorithms: ["ES256"]
    });

    const email = typeof result.payload.email === "string" ? result.payload.email : undefined;
    const subject = typeof result.payload.sub === "string" ? result.payload.sub : undefined;

    if (!email) {
      throw new AuthError("AUTH_INVALID", "Authentication token is invalid", 401);
    }

    if (!isAllowedUser(email, config.allowedUsers)) {
      throw new AuthError("FORBIDDEN", "Forbidden", 403);
    }

    return {
      email: email.toLowerCase(),
      subject,
      mode: "iap"
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError("AUTH_INVALID", "Authentication token is invalid", 401);
  }
}
