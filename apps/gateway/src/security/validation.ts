export const ACTION_ITEM_STATUSES = ["new", "reviewed", "done", "ignored"] as const;

export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export type ActionItemsQuery = {
  status: ActionItemStatus;
  limit: number;
};

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function getSingleQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    throw new ValidationError("Duplicate query parameter");
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

export function validateActionItemsQuery(query: Record<string, unknown>): ActionItemsQuery {
  const allowedQueryKeys = new Set(["status", "limit"]);
  for (const key of Object.keys(query)) {
    if (!allowedQueryKeys.has(key)) {
      throw new ValidationError(`Unsupported query parameter: ${key}`);
    }
  }

  const status = getSingleQueryValue(query.status) ?? "new";
  if (!ACTION_ITEM_STATUSES.includes(status as ActionItemStatus)) {
    throw new ValidationError("Invalid status");
  }

  const limitRaw = getSingleQueryValue(query.limit) ?? "50";
  if (!/^\d+$/.test(limitRaw)) {
    throw new ValidationError("Invalid limit");
  }

  const limit = Number.parseInt(limitRaw, 10);
  if (limit < 1 || limit > 50) {
    throw new ValidationError("Limit must be between 1 and 50");
  }

  return {
    status: status as ActionItemStatus,
    limit
  };
}
