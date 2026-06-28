export type AuthMode = "dev" | "iap";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  authMode: AuthMode;
  iapAudience?: string;
  allowedUsers: string[];
  devUserEmail?: string;
  n8nActionItemsUrl?: string;
  n8nApiAuthHeaderName?: string;
  n8nApiAuthHeaderValue?: string;
  n8nTimeoutMs: number;
  n8nMaxRetries: number;
  logLevel: string;
};

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseInteger(name: string, fallback: number): number {
  const raw = optional(process.env[name]);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}`);
  }

  return parsed;
}

function parseAllowedUsers(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  const authMode = (optional(process.env.AUTH_MODE) ?? "iap") as AuthMode;
  if (authMode !== "dev" && authMode !== "iap") {
    throw new Error("AUTH_MODE must be dev or iap");
  }

  return {
    nodeEnv: optional(process.env.NODE_ENV) ?? "development",
    port: parseInteger("PORT", 8080),
    authMode,
    iapAudience: optional(process.env.IAP_AUDIENCE),
    allowedUsers: parseAllowedUsers(process.env.ALLOWED_USERS),
    devUserEmail: optional(process.env.DEV_USER_EMAIL)?.toLowerCase(),
    n8nActionItemsUrl: optional(process.env.N8N_ACTION_ITEMS_URL),
    n8nApiAuthHeaderName: optional(process.env.N8N_API_AUTH_HEADER_NAME),
    n8nApiAuthHeaderValue: optional(process.env.N8N_API_AUTH_HEADER_VALUE),
    n8nTimeoutMs: parseInteger("N8N_TIMEOUT_MS", 8000),
    n8nMaxRetries: parseInteger("N8N_MAX_RETRIES", 1),
    logLevel: optional(process.env.LOG_LEVEL) ?? "info"
  };
}

export function requireN8nConfig(config: AppConfig): {
  url: string;
  headerName: string;
  headerValue: string;
  timeoutMs: number;
  maxRetries: number;
} {
  if (!config.n8nActionItemsUrl || !config.n8nApiAuthHeaderName || !config.n8nApiAuthHeaderValue) {
    throw new Error("Missing n8n configuration");
  }

  return {
    url: config.n8nActionItemsUrl,
    headerName: config.n8nApiAuthHeaderName,
    headerValue: config.n8nApiAuthHeaderValue,
    timeoutMs: config.n8nTimeoutMs,
    maxRetries: config.n8nMaxRetries
  };
}
