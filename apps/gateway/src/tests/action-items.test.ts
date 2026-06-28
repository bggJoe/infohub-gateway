import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { buildServer } from "../server";
import type { AppConfig } from "../config";
import { setIapJwksCacheForTests } from "../auth/verify-iap";

const originalFetch = globalThis.fetch;
let testN8nPrivateKeyPem = "";

afterEach(() => {
  globalThis.fetch = originalFetch;
  setIapJwksCacheForTests(undefined);
  vi.restoreAllMocks();
});

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    port: 8080,
    authMode: "dev",
    allowedUsers: ["joelovesband@gmail.com"],
    devUserEmail: "joelovesband@gmail.com",
    n8nActionItemsUrl: "https://n8n.example.test/webhook/action-items",
    n8nAuthMode: "jwt",
    n8nApiAuthHeaderName: "",
    n8nApiAuthHeaderValue: "",
    n8nJwtPrivateKeyPem: testN8nPrivateKeyPem,
    n8nJwtIssuer: "infohub-gateway",
    n8nJwtAudience: "infohub-n8n",
    n8nJwtScope: "infohub:action-items:read",
    n8nJwtTtlSeconds: 60,
    n8nTimeoutMs: 8000,
    n8nMaxRetries: 0,
    logLevel: "silent",
    ...overrides
  };
}

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256");
  testN8nPrivateKeyPem = await exportPKCS8(privateKey);
});

async function createIapJwt(email: string, audience: string) {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(publicKey);
  const kid = "test-iap-key";

  const token = await new SignJWT({
    email,
    sub: `accounts.google.com:${email}`
  })
    .setProtectedHeader({
      alg: "ES256",
      kid
    })
    .setIssuer("https://cloud.google.com/iap")
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  return {
    token,
    jwksCache: {
      uat: Date.now(),
      jwks: {
        keys: [
          {
            ...publicJwk,
            kid,
            alg: "ES256",
            use: "sig"
          }
        ]
      }
    }
  };
}

describe("gateway routes", () => {
  it("returns health response", async () => {
    const server = await buildServer(config());
    const response = await server.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "infohub-gateway",
      version: "0.1.0"
    });
    expect(response.headers["cache-control"]).toBe("no-store");

    await server.close();
  });

  it("returns security headers on API responses", async () => {
    const server = await buildServer(config());
    const response = await server.inject({ method: "GET", url: "/api/health" });

    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");

    await server.close();
  });

  it("returns redacted action items in dev mode", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "1",
            status: "new",
            action_required: true,
            subject: "Follow up",
            body: "raw body",
            html: "<p>raw</p>",
            token: "secret"
          }
        ]
      })
    ) as typeof fetch;

    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=new&limit=1"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      count: 1,
      filters: {
        status: "new",
        limit: 1,
        action_required: true
      },
      data: [
        {
          id: "1",
          status: "new",
          action_required: true,
          subject: "Follow up"
        }
      ]
    });

    await server.close();
  });

  it("rejects limit above 50", async () => {
    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?limit=51"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: "Limit must be between 1 and 50"
      }
    });

    await server.close();
  });

  it("rejects arbitrary query passthrough", async () => {
    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=new&limit=10&path=/admin"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");

    await server.close();
  });

  it("returns 404 for unknown routes", async () => {
    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/not-allowed"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Not found"
      }
    });

    await server.close();
  });

  it("rejects invalid status", async () => {
    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=invalid"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");

    await server.close();
  });

  it("rejects dev user outside allowlist", async () => {
    const server = await buildServer(
      config({
        devUserEmail: "intruder@example.com"
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden"
      }
    });

    await server.close();
  });

  it("rejects missing IAP JWT in iap mode", async () => {
    const server = await buildServer(
      config({
        authMode: "iap",
        iapAudience: "/projects/123/locations/asia-east1/services/infohub-gateway"
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_REQUIRED");

    await server.close();
  });

  it("does not trust unsigned IAP identity headers alone", async () => {
    const server = await buildServer(
      config({
        authMode: "iap",
        iapAudience: "/projects/123/locations/asia-east1/services/infohub-gateway"
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items",
      headers: {
        "x-goog-authenticated-user-email": "accounts.google.com:joelovesband@gmail.com"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_REQUIRED");

    await server.close();
  });

  it("rejects invalid IAP JWT", async () => {
    const server = await buildServer(
      config({
        authMode: "iap",
        iapAudience: "/projects/123/locations/asia-east1/services/infohub-gateway"
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items",
      headers: {
        "x-goog-iap-jwt-assertion": "not-a-valid-jwt"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_INVALID");

    await server.close();
  });

  it("accepts a valid signed IAP JWT for an allowlisted user", async () => {
    const audience = "/projects/123/locations/asia-east1/services/infohub-gateway";
    const { token, jwksCache } = await createIapJwt("joelovesband@gmail.com", audience);
    setIapJwksCacheForTests(jwksCache);

    globalThis.fetch = vi.fn(async () => {
      return Response.json({ data: [{ id: "iap-1", status: "new", body: "raw body" }] });
    }) as typeof fetch;

    const server = await buildServer(
      config({
        authMode: "iap",
        iapAudience: audience
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=new&limit=1",
      headers: {
        "x-goog-iap-jwt-assertion": token
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      count: 1,
      filters: {
        status: "new",
        limit: 1,
        action_required: true
      },
      data: [
        {
          id: "iap-1",
          status: "new"
        }
      ]
    });

    await server.close();
  });

  it("rejects a valid signed IAP JWT when email is not allowlisted", async () => {
    const audience = "/projects/123/locations/asia-east1/services/infohub-gateway";
    const { token, jwksCache } = await createIapJwt("intruder@example.com", audience);
    setIapJwksCacheForTests(jwksCache);
    globalThis.fetch = vi.fn(async () => Response.json({ data: [] })) as typeof fetch;

    const server = await buildServer(
      config({
        authMode: "iap",
        iapAudience: audience
      })
    );
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items",
      headers: {
        "x-goog-iap-jwt-assertion": token
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");

    await server.close();
  });

  it("handles n8n upstream error without leaking upstream details", async () => {
    globalThis.fetch = vi.fn(async () => new Response("upstream secret body", { status: 500 })) as typeof fetch;

    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=new&limit=1"
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "N8N_UPSTREAM_ERROR",
        message: "Upstream request failed"
      }
    });
    expect(response.body).not.toContain("upstream secret body");
    expect(response.body).not.toContain("n8n.example.test");

    await server.close();
  });

  it("handles n8n timeout safely", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    }) as typeof fetch;

    const server = await buildServer(config());
    const response = await server.inject({
      method: "GET",
      url: "/api/action-items?status=new&limit=1"
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: "N8N_TIMEOUT",
        message: "Upstream request timed out"
      }
    });

    await server.close();
  });
});
