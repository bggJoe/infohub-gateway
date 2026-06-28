import type { ActionItemsQuery } from "../security/validation";
import type { AuthContext } from "../auth/auth-context";
import { signDownstreamJwt } from "../auth/downstream-jwt";
import type { N8nAuthMode } from "../config";

export class N8nClientError extends Error {
  readonly code: "N8N_UPSTREAM_ERROR" | "N8N_TIMEOUT";
  readonly statusCode: number;
  readonly upstreamStatus?: number;

  constructor(
    code: N8nClientError["code"],
    message: string,
    statusCode = 502,
    upstreamStatus?: number
  ) {
    super(message);
    this.name = "N8nClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
  }
}

export type N8nClientConfig = {
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
};

export type N8nActionItemsResult = {
  rows: Array<Record<string, unknown>>;
  status: number;
};

export class N8nClient {
  constructor(private readonly config: N8nClientConfig) {}

  async fetchActionItems(
    query: ActionItemsQuery,
    context: {
      auth: AuthContext;
      method: string;
      path: string;
    }
  ): Promise<N8nActionItemsResult> {
    const url = new URL(this.config.url);
    url.searchParams.set("status", query.status);
    url.searchParams.set("limit", String(query.limit));
    url.searchParams.set("action_required", "true");

    let lastError: unknown;
    const attempts = this.config.maxRetries + 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: await this.buildHeaders(context),
          signal: AbortSignal.timeout(this.config.timeoutMs)
        });

        if (!response.ok) {
          throw new N8nClientError(
            "N8N_UPSTREAM_ERROR",
            "n8n upstream returned an error",
            502,
            response.status
          );
        }

        const body = (await response.json()) as unknown;
        return {
          rows: normalizeN8nRows(body),
          status: response.status
        };
      } catch (error) {
        lastError = error;
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new N8nClientError("N8N_TIMEOUT", "n8n request timed out", 504);
        }
        if (error instanceof N8nClientError && attempt === attempts - 1) {
          throw error;
        }
        if (attempt === attempts - 1) {
          break;
        }
      }
    }

    if (lastError instanceof N8nClientError) {
      throw lastError;
    }

    throw new N8nClientError("N8N_UPSTREAM_ERROR", "n8n upstream request failed");
  }

  private async buildHeaders(context: {
    auth: AuthContext;
    method: string;
    path: string;
  }): Promise<Record<string, string>> {
    if (this.config.authMode === "header") {
      return {
        Accept: "application/json",
        [this.config.headerName]: this.config.headerValue
      };
    }

    const jwt = await signDownstreamJwt(
      {
        privateKeyPem: this.config.jwtPrivateKeyPem,
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        scope: this.config.jwtScope,
        ttlSeconds: this.config.jwtTtlSeconds
      },
      context
    );

    return {
      Accept: "application/json",
      Authorization: `Bearer ${jwt}`
    };
  }
}

function normalizeN8nRows(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (isRecord(body)) {
    const possibleRows = body.data ?? body.items ?? body.rows;
    if (Array.isArray(possibleRows)) {
      return possibleRows.filter(isRecord);
    }
  }

  throw new N8nClientError("N8N_UPSTREAM_ERROR", "n8n upstream response is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
