import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../server";
import type { AppConfig } from "../config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
    n8nApiAuthHeaderName: "x-infohub-api-key",
    n8nApiAuthHeaderValue: "secret",
    n8nTimeoutMs: 8000,
    n8nMaxRetries: 0,
    logLevel: "silent",
    ...overrides
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
});
