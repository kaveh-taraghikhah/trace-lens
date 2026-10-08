import type { FastifyReply, FastifyRequest } from "fastify";
import {
  PlatformRepository,
  roleAtLeast,
  type ApiKeyRecord,
  type ApiKeyRole,
} from "@tracelens/database";

export type AuthMode = "dev" | "api_key";

export interface AuthContext {
  mode: AuthMode;
  projectId: string;
  actor: string;
  role: ApiKeyRole;
  apiKeyId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export function getAuthMode(): AuthMode {
  const raw = (process.env.TRACELENS_AUTH_MODE ?? "dev").toLowerCase();
  return raw === "api_key" ? "api_key" : "dev";
}

function extractApiKey(req: FastifyRequest): string | null {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export function createAuthHook(opts: {
  platform: PlatformRepository;
  defaultProjectId: () => Promise<string>;
  log: { warn: (obj: object, msg: string) => void };
}) {
  return async function authHook(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Health is always open
    if (req.url === "/health" || req.url.startsWith("/health?")) {
      req.auth = {
        mode: "dev",
        projectId: "public",
        actor: "health",
        role: "viewer",
        apiKeyId: null,
      };
      return;
    }

    const mode = getAuthMode();
    const plaintext = extractApiKey(req);

    if (plaintext) {
      const key = await opts.platform.findApiKeyByPlaintext(plaintext);
      if (!key) {
        return reply.code(401).send({ error: "invalid_api_key" });
      }
      void opts.platform.touchApiKey(key.id);
      req.auth = {
        mode: "api_key",
        projectId: key.projectId,
        actor: `key:${key.name}`,
        role: key.role,
        apiKeyId: key.id,
      };
      return;
    }

    if (mode === "api_key") {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Provide X-API-Key or Authorization: Bearer <tl_live_…>",
      });
    }

    // Dev mode: anonymous admin for local demos
    const projectId = await opts.defaultProjectId();
    req.auth = {
      mode: "dev",
      projectId,
      actor: "dev",
      role: "admin",
      apiKeyId: null,
    };
  };
}

export function requireRole(required: ApiKeyRole) {
  return async function roleGuard(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!req.auth || !roleAtLeast(req.auth.role, required)) {
      return reply.code(403).send({
        error: "forbidden",
        message: `Requires role ${required} or higher (have ${req.auth?.role ?? "none"})`,
      });
    }
  };
}

export async function audit(
  platform: PlatformRepository,
  req: FastifyRequest,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!req.auth || req.auth.projectId === "public") return;
  try {
    await platform.writeAudit({
      projectId: req.auth.projectId,
      actor: req.auth.actor,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: {
        ...input.metadata,
        role: req.auth.role,
        mode: req.auth.mode,
      },
      ip: req.ip,
    });
  } catch {
    // never fail the request on audit write
  }
}

export type { ApiKeyRecord };
