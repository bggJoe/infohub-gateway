export type AuthMode = "dev" | "iap";
export type N8nAuthMode = "jwt" | "header";

export type AppConfig = {
  nodeEnv: string;
  port: number;
  authMode: AuthMode;
  iapAudience?: string;
  allowedUsers: string[];
  devUserEmail?: string;
  n8nActionItemsUrl?: string;
  n8nAuthMode: N8nAuthMode;
  n8nApiAuthHeaderName?: string;
  n8nApiAuthHeaderValue?: string;
  n8nJwtPrivateKeyPem?: string;
  n8nJwtIssuer?: string;
  n8nJwtAudience?: string;
  n8nJwtScope: string;
  n8nJwtTtlSeconds: number;
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

  const n8nAuthMode = (optional(process.env.N8N_AUTH_MODE) ?? "jwt") as N8nAuthMode;
  if (n8nAuthMode !== "jwt" && n8nAuthMode !== "header") {
    throw new Error("N8N_AUTH_MODE must be jwt or header");
  }

  const config = {
    nodeEnv: optional(process.env.NODE_ENV) ?? "development",
    port: parseInteger("PORT", 8080),
    authMode,
    iapAudience: optional(process.env.IAP_AUDIENCE),
    allowedUsers: parseAllowedUsers(process.env.ALLOWED_USERS),
    devUserEmail: optional(process.env.DEV_USER_EMAIL)?.toLowerCase(),
    n8nActionItemsUrl: optional(process.env.N8N_ACTION_ITEMS_URL),
    n8nAuthMode,
    n8nApiAuthHeaderName: optional(process.env.N8N_API_AUTH_HEADER_NAME),
    n8nApiAuthHeaderValue: optional(process.env.N8N_API_AUTH_HEADER_VALUE),
    n8nJwtPrivateKeyPem: decodeEscapedPem(optional(process.env.N8N_JWT_PRIVATE_KEY_PEM)),
    n8nJwtIssuer: optional(process.env.N8N_JWT_ISSUER),
    n8nJwtAudience: optional(process.env.N8N_JWT_AUDIENCE),
    n8nJwtScope: optional(process.env.N8N_JWT_SCOPE) ?? "infohub:action-items:read",
    n8nJwtTtlSeconds: parseInteger("N8N_JWT_TTL_SECONDS", 60),
    n8nTimeoutMs: parseInteger("N8N_TIMEOUT_MS", 8000),
    n8nMaxRetries: parseInteger("N8N_MAX_RETRIES", 1),
    logLevel: optional(process.env.LOG_LEVEL) ?? "info"
  };

  validateConfig(config);
  return config;
}

export function requireN8nConfig(config: AppConfig): {
  url: string;
  authMode: N8nAuthMode;
  headerName: string;
  headerValue: string;
  jwtPrivateKeyPem: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtScope: string;
  jwtTtlSeconds: number;
  timeoutMs: number;
  maxRetries: number;
} {
  if (!config.n8nActionItemsUrl) {
    throw new Error("Missing n8n configuration");
  }

  assertHttpUrl(config.n8nActionItemsUrl, "N8N_ACTION_ITEMS_URL");

  if (config.n8nAuthMode === "header") {
    if (!config.n8nApiAuthHeaderName || !config.n8nApiAuthHeaderValue) {
      throw new Error("Missing n8n header auth configuration");
    }
  }

  if (config.n8nAuthMode === "jwt") {
    if (!config.n8nJwtPrivateKeyPem || !config.n8nJwtIssuer || !config.n8nJwtAudience) {
      throw new Error("Missing n8n JWT auth configuration");
    }
  }

  return {
    url: config.n8nActionItemsUrl,
    authMode: config.n8nAuthMode,
    headerName: config.n8nApiAuthHeaderName ?? "",
    headerValue: config.n8nApiAuthHeaderValue ?? "",
    jwtPrivateKeyPem: config.n8nJwtPrivateKeyPem ?? "",
    jwtIssuer: config.n8nJwtIssuer ?? "",
    jwtAudience: config.n8nJwtAudience ?? "",
    jwtScope: config.n8nJwtScope,
    jwtTtlSeconds: config.n8nJwtTtlSeconds,
    timeoutMs: config.n8nTimeoutMs,
    maxRetries: config.n8nMaxRetries
  };
}

function validateConfig(config: AppConfig): void {
  if (config.nodeEnv === "production" && config.authMode !== "iap") {
    throw new Error("AUTH_MODE=iap is required in production");
  }

  if (config.authMode === "iap" && !config.iapAudience) {
    throw new Error("IAP_AUDIENCE is required when AUTH_MODE=iap");
  }

  if (config.authMode === "dev" && !config.devUserEmail) {
    throw new Error("DEV_USER_EMAIL is required when AUTH_MODE=dev");
  }

  if (config.allowedUsers.length === 0) {
    throw new Error("ALLOWED_USERS must include at least one email");
  }

  if (config.n8nTimeoutMs < 1) {
    throw new Error("N8N_TIMEOUT_MS must be greater than 0");
  }

  if (config.n8nJwtTtlSeconds < 1) {
    throw new Error("N8N_JWT_TTL_SECONDS must be greater than 0");
  }

  if (config.nodeEnv === "production" && config.n8nAuthMode !== "jwt") {
    throw new Error("N8N_AUTH_MODE=jwt is required in production");
  }
}

function assertHttpUrl(value: string, name: string): void {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
}

function decodeEscapedPem(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}
