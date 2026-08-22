import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import {
  type AdminAction,
  assertAdminActor,
  assertPasswordChangeActor,
  normalizeUsername,
  PolicyError,
  type Profile,
  type Role,
  toInternalEmail,
} from "./policy.ts";

export type { Profile } from "./policy.ts";

export type ProfileSummary = Profile & {
  created_at: string;
  updated_at: string;
};

type NewProfile = Omit<ProfileSummary, "created_at" | "updated_at">;
type ProfilePatch = Partial<
  Pick<Profile, "is_active" | "must_change_password">
>;

export interface AdminGateway {
  listProfiles(): Promise<ProfileSummary[]>;
  getProfile(userId: string): Promise<ProfileSummary | null>;
  countActiveAdmins(): Promise<number>;
  createAuthUser(
    input: { email: string; password: string },
  ): Promise<{ id: string }>;
  deleteAuthUser(userId: string): Promise<void>;
  upsertProfile(profile: NewProfile): Promise<ProfileSummary>;
  updateAuthPassword(userId: string, password: string): Promise<void>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileSummary>;
}

export interface HandlerDependencies {
  authenticate(accessToken: string): Promise<Profile | null>;
  verifyPassword(email: string, password: string): Promise<string | null>;
  createAdminGateway(): AdminGateway;
}

type ErrorDefinition = {
  status: number;
  message: string;
};

const ERROR_DEFINITIONS: Record<string, ErrorDefinition> = {
  invalid_request: { status: 400, message: "请求格式不正确" },
  invalid_action: { status: 400, message: "不支持的账号操作" },
  invalid_username: { status: 400, message: "账号格式不正确" },
  invalid_password: { status: 400, message: "密码至少需要 8 位" },
  password_reuse: { status: 400, message: "新密码不能与当前密码相同" },
  invalid_role: { status: 400, message: "账号角色不正确" },
  origin_not_allowed: { status: 403, message: "请求来源不允许" },
  unauthorized: { status: 401, message: "登录已失效，请重新登录" },
  invalid_current_password: { status: 401, message: "当前密码不正确" },
  account_inactive: { status: 403, message: "账号已停用，请联系管理员" },
  password_change_required: { status: 403, message: "请先完成密码修改" },
  password_change_not_required: {
    status: 409,
    message: "当前账号无需完成首次改密",
  },
  admin_required: { status: 403, message: "需要管理员权限" },
  self_deactivation: { status: 409, message: "不能停用当前登录账号" },
  last_admin: { status: 409, message: "不能停用最后一个有效管理员" },
  account_not_found: { status: 404, message: "账号不存在" },
  username_exists: { status: 409, message: "账号已存在" },
  method_not_allowed: { status: 405, message: "请求方法不支持" },
  service_unavailable: { status: 503, message: "操作失败，请稍后重试" },
  password_changed_profile_pending: {
    status: 503,
    message: "密码已修改，但状态更新失败；请使用新密码重试",
  },
};

export class AdminUsersError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;

  constructor(code: string) {
    const definition = ERROR_DEFINITIONS[code] ??
      ERROR_DEFINITIONS.service_unavailable;
    super(code);
    this.name = "AdminUsersError";
    this.code = ERROR_DEFINITIONS[code] ? code : "service_unavailable";
    this.status = definition.status;
    this.publicMessage = definition.message;
  }
}

function errorResponse(
  error: AdminUsersError,
  origin: string | null,
): Response {
  return Response.json(
    { code: error.code, message: error.publicMessage },
    { status: error.status, headers: corsHeaders(origin) },
  );
}

function successResponse(
  data: unknown,
  origin: string | null,
  status = 200,
): Response {
  return Response.json({ data }, { status, headers: corsHeaders(origin) });
}

function parseBearer(value: string | null): string | null {
  const match = value?.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new AdminUsersError("invalid_request");
  }
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminUsersError("invalid_request");
  }
  return value;
}

function requirePassword(body: Record<string, unknown>, key: string): string {
  const password = requireString(body, key);
  if (password.length < 8) {
    throw new AdminUsersError("invalid_password");
  }
  return password;
}

function requireRole(value: unknown): Role {
  if (value !== "admin" && value !== "member") {
    throw new AdminUsersError("invalid_role");
  }
  return value;
}

function toAdminUsersError(error: unknown): AdminUsersError {
  if (error instanceof AdminUsersError) {
    return error;
  }
  if (error instanceof PolicyError) {
    return new AdminUsersError(error.code);
  }
  return new AdminUsersError("service_unavailable");
}

async function handleCompletePasswordChange(
  body: Record<string, unknown>,
  actor: Profile,
  dependencies: HandlerDependencies,
): Promise<ProfileSummary> {
  assertExactKeys(body, ["action", "currentPassword", "newPassword"]);
  assertPasswordChangeActor(actor);

  const currentPassword = requireString(body, "currentPassword");
  const newPassword = requirePassword(body, "newPassword");
  if (currentPassword === newPassword) {
    throw new AdminUsersError("password_reuse");
  }

  const verifiedUserId = await dependencies.verifyPassword(
    toInternalEmail(actor.username),
    currentPassword,
  );
  if (verifiedUserId !== actor.id) {
    throw new AdminUsersError("invalid_current_password");
  }

  const gateway = dependencies.createAdminGateway();
  try {
    await gateway.updateAuthPassword(actor.id, newPassword);
  } catch {
    throw new AdminUsersError("service_unavailable");
  }

  try {
    return await gateway.updateProfile(actor.id, {
      must_change_password: false,
    });
  } catch {
    throw new AdminUsersError("password_changed_profile_pending");
  }
}

async function handleAdminAction(
  action: AdminAction,
  body: Record<string, unknown>,
  actor: Profile,
  dependencies: HandlerDependencies,
): Promise<{ data: unknown; status?: number }> {
  assertAdminActor(actor, action, null);
  const gateway = dependencies.createAdminGateway();

  if (action === "list") {
    assertExactKeys(body, ["action"]);
    return { data: await gateway.listProfiles() };
  }

  if (action === "create") {
    assertExactKeys(body, ["action", "username", "password", "role"]);
    const rawUsername = requireString(body, "username");
    const username = normalizeUsername(rawUsername);
    const password = requirePassword(body, "password");
    const role = requireRole(body.role);
    const authUser = await gateway.createAuthUser({
      email: toInternalEmail(username),
      password,
    });
    try {
      const profile = await gateway.upsertProfile({
        id: authUser.id,
        username,
        role,
        is_active: true,
        must_change_password: true,
      });
      return { data: profile, status: 201 };
    } catch (error) {
      try {
        await gateway.deleteAuthUser(authUser.id);
      } catch {
        // Preserve the original failure while avoiding secret-bearing diagnostics.
      }
      throw error;
    }
  }

  const allowedKeys = action === "resetPassword"
    ? ["action", "targetId", "password"]
    : ["action", "targetId"];
  assertExactKeys(body, allowedKeys);
  const targetId = requireString(body, "targetId");
  const target = await gateway.getProfile(targetId);
  if (!target) {
    throw new AdminUsersError("account_not_found");
  }

  if (action === "activate") {
    return {
      data: await gateway.updateProfile(target.id, { is_active: true }),
    };
  }

  if (action === "deactivate") {
    const activeAdminCount = target.role === "admin" && target.is_active
      ? await gateway.countActiveAdmins()
      : 0;
    assertAdminActor(actor, action, { ...target, activeAdminCount });
    return {
      data: await gateway.updateProfile(target.id, { is_active: false }),
    };
  }

  const password = requirePassword(body, "password");
  await gateway.updateAuthPassword(target.id, password);
  return {
    data: await gateway.updateProfile(target.id, {
      must_change_password: true,
    }),
  };
}

const ADMIN_ACTIONS = new Set<AdminAction>([
  "list",
  "create",
  "activate",
  "deactivate",
  "resetPassword",
]);

export async function handleAdminUsersRequest(
  request: Request,
  dependencies: HandlerDependencies,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return errorResponse(new AdminUsersError("origin_not_allowed"), origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return errorResponse(new AdminUsersError("method_not_allowed"), origin);
  }

  const accessToken = parseBearer(request.headers.get("authorization"));
  if (!accessToken) {
    return errorResponse(new AdminUsersError("unauthorized"), origin);
  }

  try {
    const actor = await dependencies.authenticate(accessToken);
    if (!actor) {
      throw new AdminUsersError("unauthorized");
    }

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      throw new AdminUsersError("invalid_request");
    }
    if (!isRecord(parsedBody)) {
      throw new AdminUsersError("invalid_request");
    }

    const action = parsedBody.action;
    if (action === "completePasswordChange") {
      const profile = await handleCompletePasswordChange(
        parsedBody,
        actor,
        dependencies,
      );
      return successResponse(profile, origin);
    }
    if (
      typeof action !== "string" || !ADMIN_ACTIONS.has(action as AdminAction)
    ) {
      throw new AdminUsersError("invalid_action");
    }

    const result = await handleAdminAction(
      action as AdminAction,
      parsedBody,
      actor,
      dependencies,
    );
    return successResponse(result.data, origin, result.status);
  } catch (error) {
    return errorResponse(toAdminUsersError(error), origin);
  }
}
