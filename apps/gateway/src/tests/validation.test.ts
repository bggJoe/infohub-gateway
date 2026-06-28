import { describe, expect, it } from "vitest";
import { validateActionItemsQuery } from "../security/validation";

describe("validateActionItemsQuery", () => {
  it("uses safe defaults", () => {
    expect(validateActionItemsQuery({})).toEqual({
      status: "new",
      limit: 50
    });
  });

  it("accepts allowed status and limit", () => {
    expect(validateActionItemsQuery({ status: "done", limit: "10" })).toEqual({
      status: "done",
      limit: 10
    });
  });

  it("rejects invalid status", () => {
    expect(() => validateActionItemsQuery({ status: "pending" })).toThrow("Invalid status");
  });

  it("rejects limit above 50", () => {
    expect(() => validateActionItemsQuery({ limit: "1000" })).toThrow("Limit must be between 1 and 50");
  });

  it("rejects arbitrary query passthrough", () => {
    expect(() => validateActionItemsQuery({ path: "/admin" })).toThrow("Unsupported query parameter");
  });
});
