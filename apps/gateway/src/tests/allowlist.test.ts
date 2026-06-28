import { describe, expect, it } from "vitest";
import { isAllowedUser } from "../auth/allowlist";
import { authenticateDevUser } from "../auth/dev-auth";
import type { AppConfig } from "../config";

function config(overrides: Partial<AppConfig>): AppConfig {
  return {
    nodeEnv: "test",
    port: 8080,
    authMode: "dev",
    allowedUsers: ["joelovesband@gmail.com"],
    n8nTimeoutMs: 8000,
    n8nMaxRetries: 1,
    logLevel: "silent",
    ...overrides
  };
}

describe("allowlist", () => {
  it("matches email case-insensitively", () => {
    expect(isAllowedUser("JoeLovesBand@Gmail.com", ["joelovesband@gmail.com"])).toBe(true);
  });

  it("fails closed when allowlist is empty", () => {
    expect(isAllowedUser("joelovesband@gmail.com", [])).toBe(false);
  });

  it("allows dev user only when allowlisted", () => {
    expect(authenticateDevUser(config({ devUserEmail: "joelovesband@gmail.com" }))).toMatchObject({
      email: "joelovesband@gmail.com",
      mode: "dev"
    });
  });

  it("rejects dev user outside allowlist", () => {
    expect(() => authenticateDevUser(config({ devUserEmail: "other@example.com" }))).toThrow("Forbidden");
  });
});
