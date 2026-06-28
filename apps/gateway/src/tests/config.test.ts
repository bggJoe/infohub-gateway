import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, requireN8nConfig } from "../config";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setBaseEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.AUTH_MODE = "dev";
  process.env.DEV_USER_EMAIL = "joelovesband@gmail.com";
  process.env.ALLOWED_USERS = "joelovesband@gmail.com";
  process.env.N8N_ACTION_ITEMS_URL = "https://n8n.example.test/webhook/action-items";
  process.env.N8N_API_AUTH_HEADER_NAME = "x-infohub-api-key";
  process.env.N8N_API_AUTH_HEADER_VALUE = "secret";
}

describe("loadConfig", () => {
  it("loads a valid dev config", () => {
    setBaseEnv();

    expect(loadConfig()).toMatchObject({
      nodeEnv: "test",
      authMode: "dev",
      devUserEmail: "joelovesband@gmail.com",
      allowedUsers: ["joelovesband@gmail.com"],
      n8nTimeoutMs: 8000,
      n8nMaxRetries: 1
    });
  });

  it("rejects dev auth in production", () => {
    setBaseEnv();
    process.env.NODE_ENV = "production";

    expect(() => loadConfig()).toThrow("AUTH_MODE=iap is required in production");
  });

  it("requires IAP audience in iap mode", () => {
    setBaseEnv();
    process.env.AUTH_MODE = "iap";
    delete process.env.IAP_AUDIENCE;

    expect(() => loadConfig()).toThrow("IAP_AUDIENCE is required when AUTH_MODE=iap");
  });

  it("requires a dev user in dev mode", () => {
    setBaseEnv();
    delete process.env.DEV_USER_EMAIL;

    expect(() => loadConfig()).toThrow("DEV_USER_EMAIL is required when AUTH_MODE=dev");
  });

  it("requires a non-empty allowlist", () => {
    setBaseEnv();
    process.env.ALLOWED_USERS = "";

    expect(() => loadConfig()).toThrow("ALLOWED_USERS must include at least one email");
  });

  it("rejects zero n8n timeout", () => {
    setBaseEnv();
    process.env.N8N_TIMEOUT_MS = "0";

    expect(() => loadConfig()).toThrow("N8N_TIMEOUT_MS must be greater than 0");
  });
});

describe("requireN8nConfig", () => {
  it("requires a valid n8n URL", () => {
    setBaseEnv();
    process.env.N8N_ACTION_ITEMS_URL = "not-a-url";

    const config = loadConfig();

    expect(() => requireN8nConfig(config)).toThrow("N8N_ACTION_ITEMS_URL must be a valid URL");
  });

  it("requires http or https n8n URL", () => {
    setBaseEnv();
    process.env.N8N_ACTION_ITEMS_URL = "file:///tmp/action-items";

    const config = loadConfig();

    expect(() => requireN8nConfig(config)).toThrow("N8N_ACTION_ITEMS_URL must use http or https");
  });
});
