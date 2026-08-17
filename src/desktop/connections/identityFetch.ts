export interface ServerContext {
  origin: string;
  apiVersion: string;
  getToken: () => string | null;
}

export class IdentityFetchError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`identity fetch failed with status ${status}`);
    this.name = "IdentityFetchError";
    this.status = status;
    this.body = body;
  }
}

interface HydraMemberCollection<T> {
  "hydra:member"?: T[];
}

const VERSIONED_PATH = /^\/api\/v\d+(\/|$)/;

function buildUrl(ctx: ServerContext, path: string): string {
  if (VERSIONED_PATH.test(path)) return `${ctx.origin}${path}`;
  return `${ctx.origin}/api/${ctx.apiVersion}${path}`;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function send<T>(ctx: ServerContext, path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/ld+json");
  const token = ctx.getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(buildUrl(ctx, path), {
    ...init,
    headers,
    credentials: "omit",
  });

  const body = await parseBody(response);
  if (!response.ok) throw new IdentityFetchError(response.status, body);
  return body as T;
}

export async function identityFetch<T>(ctx: ServerContext, path: string): Promise<T> {
  return send<T>(ctx, path, { method: "GET" });
}

export async function identityPost<T>(
  ctx: ServerContext,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = new Headers();
  const init: RequestInit = { method: "POST", headers };
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }
  return send<T>(ctx, path, init);
}

export function unwrapMember<T>(payload: HydraMemberCollection<T> | T[]): T[] {
  if (Array.isArray(payload)) return payload;
  return payload["hydra:member"] ?? [];
}
