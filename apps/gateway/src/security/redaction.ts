export const allowedActionItemFields = [
  "id",
  "source",
  "source_type",
  "source_group",
  "category",
  "priority",
  "status",
  "action_required",
  "action_text",
  "summary",
  "subject",
  "sender",
  "received_at",
  "entities",
  "topics",
  "confidence",
  "needs_human_review",
  "source_url",
  "message_id",
  "thread_id"
] as const;

export type DashboardSafeActionItem = Partial<Record<(typeof allowedActionItemFields)[number], unknown>>;

const allowedFields = new Set<string>(allowedActionItemFields);

export function redactActionItem(row: Record<string, unknown>): DashboardSafeActionItem {
  const safe: DashboardSafeActionItem = {};

  for (const [key, value] of Object.entries(row)) {
    if (allowedFields.has(key)) {
      safe[key as keyof DashboardSafeActionItem] = value;
    }
  }

  return safe;
}

export function redactActionItems(rows: Array<Record<string, unknown>>): DashboardSafeActionItem[] {
  return rows.map(redactActionItem);
}
