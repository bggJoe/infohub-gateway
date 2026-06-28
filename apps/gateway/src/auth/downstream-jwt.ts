import { randomUUID } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { AuthContext } from "./auth-context";

export type DownstreamJwtConfig = {
  privateKeyPem: string;
  issuer: string;
  audience: string;
  scope: string;
  ttlSeconds: number;
};

export type DownstreamJwtRequest = {
  method: string;
  path: string;
  auth: AuthContext;
};

export async function signDownstreamJwt(
  config: DownstreamJwtConfig,
  request: DownstreamJwtRequest
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(config.privateKeyPem, "RS256");

  return new SignJWT({
    scope: config.scope,
    method: request.method,
    path: request.path,
    email: request.auth.email
  })
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT"
    })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(request.auth.subject ?? request.auth.email)
    .setIssuedAt(now)
    .setExpirationTime(now + config.ttlSeconds)
    .setJti(randomUUID())
    .sign(privateKey);
}
