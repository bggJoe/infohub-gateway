import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { N8nClient, N8nClientError } from "../clients/n8n-client";

const originalFetch = globalThis.fetch;

const authContext = {
  email: "joelovesband@gmail.com",
  subject: "accounts.google.com:joelovesband@gmail.com",
  mode: "iap" as const
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function jwtClient(): Promise<N8nClient> {
  const { privateKey } = await generateKeyPair("RS256");
  const privateKeyPem = await exportPKCS8(privateKey);

  return new N8nClient({
    url: "https://n8n.example.test/webhook/action-items",
    authMode: "jwt",
    headerName: "",
    headerValue: "",
    jwtPrivateKeyPem: privateKeyPem,
    jwtIssuer: "infohub-gateway",
    jwtAudience: "infohub-n8n",
    jwtScope: "infohub:action-items:read",
    jwtTtlSeconds: 60,
    timeoutMs: 100,
    maxRetries: 0
  });
}

function headerClient(): N8nClient {
  return new N8nClient({
    url: "https://n8n.example.test/webhook/action-items",
    authMode: "header",
    headerName: "x-infohub-api-key",
    headerValue: "secret",
    jwtPrivateKeyPem: "",
    jwtIssuer: "",
    jwtAudience: "",
    jwtScope: "infohub:action-items:read",
    jwtTtlSeconds: 60,
    timeoutMs: 100,
    maxRetries: 0
  });
}

function requestContext() {
  return {
    auth: authContext,
    method: "GET",
    path: "/api/action-items"
  };
}

describe("N8nClient", () => {
  it("passes only allowlisted query parameters to n8n in legacy header mode", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: "1" }] }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await headerClient().fetchActionItems({ status: "new", limit: 20 }, requestContext());

    const [url, init] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));

    expect(result).toEqual({
      rows: [{ id: "1" }],
      status: 200
    });
    expect(parsedUrl.searchParams.get("status")).toBe("new");
    expect(parsedUrl.searchParams.get("limit")).toBe("20");
    expect(parsedUrl.searchParams.get("action_required")).toBe("true");
    expect([...parsedUrl.searchParams.keys()].sort()).toEqual(["action_required", "limit", "status"]);
    expect((init?.headers as Record<string, string>)["x-infohub-api-key"]).toBe("secret");
  });

  it("uses Gateway-signed downstream JWT auth in jwt mode", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const privateKeyPem = await exportPKCS8(privateKey);
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: "1" }] }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new N8nClient({
      url: "https://n8n.example.test/webhook/action-items",
      authMode: "jwt",
      headerName: "",
      headerValue: "",
      jwtPrivateKeyPem: privateKeyPem,
      jwtIssuer: "infohub-gateway",
      jwtAudience: "infohub-n8n",
      jwtScope: "infohub:action-items:read",
      jwtTtlSeconds: 60,
      timeoutMs: 100,
      maxRetries: 0
    });

    await client.fetchActionItems({ status: "new", limit: 20 }, requestContext());

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    const token = headers.Authorization?.replace("Bearer ", "");

    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers["x-infohub-api-key"]).toBeUndefined();

    const verified = await jwtVerify(token, publicKey, {
      issuer: "infohub-gateway",
      audience: "infohub-n8n",
      algorithms: ["RS256"]
    });

    expect(verified.payload).toMatchObject({
      sub: "accounts.google.com:joelovesband@gmail.com",
      email: "joelovesband@gmail.com",
      scope: "infohub:action-items:read",
      method: "GET",
      path: "/api/action-items"
    });
    expect(typeof verified.payload.iat).toBe("number");
    expect(typeof verified.payload.exp).toBe("number");
    expect(typeof verified.payload.jti).toBe("string");
    expect((verified.payload.exp as number) - (verified.payload.iat as number)).toBe(60);
  });

  it("throws safe upstream error on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;

    await expect(
      (await jwtClient()).fetchActionItems({ status: "new", limit: 20 }, requestContext())
    ).rejects.toMatchObject({
      code: "N8N_UPSTREAM_ERROR"
    });
  });

  it("throws timeout error on abort timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    }) as typeof fetch;

    const client = await jwtClient();

    await expect(
      client.fetchActionItems({ status: "new", limit: 20 }, requestContext())
    ).rejects.toBeInstanceOf(N8nClientError);
    await expect(
      client.fetchActionItems({ status: "new", limit: 20 }, requestContext())
    ).rejects.toMatchObject({
      code: "N8N_TIMEOUT"
    });
  });
});
