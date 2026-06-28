import { afterEach, describe, expect, it, vi } from "vitest";
import { N8nClient, N8nClientError } from "../clients/n8n-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function client(): N8nClient {
  return new N8nClient({
    url: "https://n8n.example.test/webhook/action-items",
    headerName: "x-infohub-api-key",
    headerValue: "secret",
    timeoutMs: 100,
    maxRetries: 0
  });
}

describe("N8nClient", () => {
  it("passes only allowlisted query parameters to n8n", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: "1" }] }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await client().fetchActionItems({ status: "new", limit: 20 });

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

  it("throws safe upstream error on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch;

    await expect(client().fetchActionItems({ status: "new", limit: 20 })).rejects.toMatchObject({
      code: "N8N_UPSTREAM_ERROR"
    });
  });

  it("throws timeout error on abort timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    }) as typeof fetch;

    await expect(client().fetchActionItems({ status: "new", limit: 20 })).rejects.toBeInstanceOf(N8nClientError);
    await expect(client().fetchActionItems({ status: "new", limit: 20 })).rejects.toMatchObject({
      code: "N8N_TIMEOUT"
    });
  });
});
