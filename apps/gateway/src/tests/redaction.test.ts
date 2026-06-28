import { describe, expect, it } from "vitest";
import { redactActionItem } from "../security/redaction";

describe("redactActionItem", () => {
  it("keeps only dashboard-safe fields", () => {
    const redacted = redactActionItem({
      id: "item-1",
      status: "new",
      subject: "Safe subject",
      body: "raw body",
      body_excerpt: "excerpt",
      html: "<p>secret</p>",
      headers: { authorization: "secret" },
      attachments: [{ name: "invoice.pdf" }],
      token: "secret-token"
    });

    expect(redacted).toEqual({
      id: "item-1",
      status: "new",
      subject: "Safe subject"
    });
  });
});
