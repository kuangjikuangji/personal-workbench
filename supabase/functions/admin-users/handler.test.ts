import assert from "node:assert/strict";

import {
  type AdminGateway,
  AdminUsersError,
  handleAdminUsersRequest,
  type HandlerDependencies,
  type Profile,
  type ProfileSummary,
} from "./handler.ts";

const allowedOrigin = "http://localhost:5173";
const actor: Profile = {
  id: "admin-id",
  username: "admin",
  role: "admin",
  is_active: true,
  must_change_password: false,
};

type FakeState = {
  gatewayCreated: number;
  events: string[];
  profiles: ProfileSummary[];
  createdAuthInput?: { email: string; password: string };
  createdProfileInput?: Omit<ProfileSummary, "created_at" | "updated_at">;
  passwordUpdates: Array<{ userId: string; password: string }>;
  profileUpdates: Array<{
    userId: string;
    patch: Partial<Pick<Profile, "is_active" | "must_change_password">>;
  }>;
};

function summary(
  profile: Profile,
  createdAt = "2026-08-15T00:00:00.000Z",
): ProfileSummary {
  return {
    ...profile,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function createHarness(options: {
  authenticatedActor?: Profile | null;
  verifiedUserId?: string | null;
  activeAdminCount?: number;
  updatePasswordError?: Error;
  updateProfileError?: Error;
} = {}) {
  const state: FakeState = {
    gatewayCreated: 0,
    events: [],
    profiles: [summary(actor)],
    passwordUpdates: [],
    profileUpdates: [],
  };

  const gateway: AdminGateway = {
    listProfiles: () => Promise.resolve([...state.profiles]),
    getProfile: (userId) =>
      Promise.resolve(
        state.profiles.find((profile) => profile.id === userId) ?? null,
      ),
    countActiveAdmins: () => Promise.resolve(options.activeAdminCount ?? 1),
    createAuthUser: ({ email, password }) => {
      state.createdAuthInput = { email, password };
      return Promise.resolve({ id: "new-user-id" });
    },
    deleteAuthUser: () => Promise.resolve(),
    upsertProfile: (profile) => {
      state.createdProfileInput = profile;
      const result = summary(profile);
      state.profiles.push(result);
      return Promise.resolve(result);
    },
    updateAuthPassword: (userId, password) => {
      state.events.push("auth-password-updated");
      state.passwordUpdates.push({ userId, password });
      if (options.updatePasswordError) {
        return Promise.reject(options.updatePasswordError);
      }
      return Promise.resolve();
    },
    updateProfile: (userId, patch) => {
      state.events.push("profile-updated");
      state.profileUpdates.push({ userId, patch });
      if (options.updateProfileError) {
        return Promise.reject(options.updateProfileError);
      }
      const current = state.profiles.find((profile) => profile.id === userId);
      if (!current) {
        return Promise.reject(new AdminUsersError("account_not_found"));
      }
      const updated = {
        ...current,
        ...patch,
        updated_at: "2026-08-16T00:00:00.000Z",
      };
      state.profiles = state.profiles.map((profile) =>
        profile.id === userId ? updated : profile
      );
      return Promise.resolve(updated);
    },
  };

  const dependencies: HandlerDependencies = {
    authenticate: () =>
      Promise.resolve(
        options.authenticatedActor === undefined
          ? actor
          : options.authenticatedActor,
      ),
    verifyPassword: (_email, _password) => {
      state.events.push("current-password-verified");
      return Promise.resolve(
        options.verifiedUserId === undefined
          ? actor.id
          : options.verifiedUserId,
      );
    },
    createAdminGateway: () => {
      state.gatewayCreated += 1;
      return gateway;
    },
  };

  return { state, dependencies };
}

function request(
  body: Record<string, unknown>,
  options: { origin?: string; authorization?: string } = {},
) {
  return new Request("http://localhost/functions/v1/admin-users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: options.origin ?? allowedOrigin,
      authorization: options.authorization ?? "Bearer valid-access-token",
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return await response.json() as Record<string, unknown>;
}

Deno.test("CORS permits only exact origins and preflight does not authenticate", async () => {
  const { state, dependencies } = createHarness();
  const preflight = await handleAdminUsersRequest(
    new Request("http://localhost/functions/v1/admin-users", {
      method: "OPTIONS",
      headers: { origin: "https://kuangjikuangji.github.io" },
    }),
    dependencies,
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "https://kuangjikuangji.github.io",
  );
  assert.equal(state.gatewayCreated, 0);

  const denied = await handleAdminUsersRequest(
    request({ action: "list" }, { origin: "https://evil.example" }),
    dependencies,
  );
  assert.equal(denied.status, 403);
  assert.equal((await responseBody(denied)).code, "origin_not_allowed");
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

Deno.test("missing bearer token is rejected before service-role gateway creation", async () => {
  const { state, dependencies } = createHarness();
  const response = await handleAdminUsersRequest(
    request({ action: "list" }, { authorization: "" }),
    dependencies,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await responseBody(response), {
    code: "unauthorized",
    message: "登录已失效，请重新登录",
  });
  assert.equal(state.gatewayCreated, 0);
});

Deno.test("member cannot create an account and service-role gateway remains unreachable", async () => {
  const { state, dependencies } = createHarness({
    authenticatedActor: { ...actor, role: "member" },
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "create",
      username: "member-one",
      password: "password1",
      role: "member",
    }),
    dependencies,
  );
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).code, "admin_required");
  assert.equal(state.gatewayCreated, 0);
  assert.equal(state.createdAuthInput, undefined);
});

Deno.test("administrator creates a normalized account without returning internal email or password", async () => {
  const { state, dependencies } = createHarness();
  const response = await handleAdminUsersRequest(
    request({
      action: "create",
      username: "  Alice.Smith ",
      password: "password1",
      role: "member",
    }),
    dependencies,
  );
  assert.equal(response.status, 201);
  assert.deepEqual(state.createdAuthInput, {
    email: "alice.smith@users.workbench.invalid",
    password: "password1",
  });
  assert.deepEqual(state.createdProfileInput, {
    id: "new-user-id",
    username: "alice.smith",
    role: "member",
    is_active: true,
    must_change_password: true,
  });
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(serialized.includes("password1"), false);
  assert.equal(serialized.includes("@users.workbench.invalid"), false);
});

Deno.test("administrator cannot deactivate self or the final active administrator", async () => {
  const ownHarness = createHarness({ activeAdminCount: 2 });
  const ownResponse = await handleAdminUsersRequest(
    request({ action: "deactivate", targetId: actor.id }),
    ownHarness.dependencies,
  );
  assert.equal(ownResponse.status, 409);
  assert.equal((await responseBody(ownResponse)).code, "self_deactivation");
  assert.equal(ownHarness.state.profileUpdates.length, 0);

  const otherAdmin = summary({
    ...actor,
    id: "other-admin-id",
    username: "other-admin",
  });
  const finalHarness = createHarness({ activeAdminCount: 1 });
  finalHarness.state.profiles.push(otherAdmin);
  const finalResponse = await handleAdminUsersRequest(
    request({ action: "deactivate", targetId: otherAdmin.id }),
    finalHarness.dependencies,
  );
  assert.equal(finalResponse.status, 409);
  assert.equal((await responseBody(finalResponse)).code, "last_admin");
  assert.equal(finalHarness.state.profileUpdates.length, 0);
});

Deno.test("administrator reset changes Auth password then marks target for password change", async () => {
  const { state, dependencies } = createHarness();
  state.profiles.push(
    summary({ ...actor, id: "member-id", username: "member", role: "member" }),
  );
  const response = await handleAdminUsersRequest(
    request({
      action: "resetPassword",
      targetId: "member-id",
      password: "temporary9",
    }),
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(state.events, ["auth-password-updated", "profile-updated"]);
  assert.deepEqual(state.profileUpdates, [{
    userId: "member-id",
    patch: { must_change_password: true },
  }]);
  assert.equal(
    JSON.stringify(await responseBody(response)).includes("temporary9"),
    false,
  );
});

Deno.test("completePasswordChange rejects target selectors and never reaches password services", async () => {
  const passwordActor = {
    ...actor,
    role: "member" as const,
    must_change_password: true,
  };
  const { state, dependencies } = createHarness({
    authenticatedActor: passwordActor,
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "completePasswordChange",
      currentPassword: "temporary9",
      newPassword: "new-password9",
      targetId: "someone-else",
    }),
    dependencies,
  );
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).code, "invalid_request");
  assert.deepEqual(state.events, []);
  assert.equal(state.gatewayCreated, 0);
});

Deno.test("completePasswordChange requires current-password identity to match bearer actor", async () => {
  const passwordActor = {
    ...actor,
    role: "member" as const,
    must_change_password: true,
  };
  const { state, dependencies } = createHarness({
    authenticatedActor: passwordActor,
    verifiedUserId: "different-user-id",
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "completePasswordChange",
      currentPassword: "temporary9",
      newPassword: "new-password9",
    }),
    dependencies,
  );
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).code, "invalid_current_password");
  assert.deepEqual(state.events, ["current-password-verified"]);
  assert.equal(state.gatewayCreated, 0);
});

Deno.test("completePasswordChange updates bearer actor password before clearing own flag", async () => {
  const passwordActor = {
    ...actor,
    role: "member" as const,
    must_change_password: true,
  };
  const { state, dependencies } = createHarness({
    authenticatedActor: passwordActor,
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "completePasswordChange",
      currentPassword: "temporary9",
      newPassword: "new-password9",
    }),
    dependencies,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(state.events, [
    "current-password-verified",
    "auth-password-updated",
    "profile-updated",
  ]);
  assert.deepEqual(state.passwordUpdates, [{
    userId: passwordActor.id,
    password: "new-password9",
  }]);
  assert.deepEqual(state.profileUpdates, [{
    userId: passwordActor.id,
    patch: { must_change_password: false },
  }]);
  const serialized = JSON.stringify(await responseBody(response));
  assert.equal(serialized.includes("temporary9"), false);
  assert.equal(serialized.includes("new-password9"), false);
});

Deno.test("completePasswordChange never clears flag when Auth password update fails", async () => {
  const passwordActor = {
    ...actor,
    role: "member" as const,
    must_change_password: true,
  };
  const { state, dependencies } = createHarness({
    authenticatedActor: passwordActor,
    updatePasswordError: new Error("auth unavailable"),
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "completePasswordChange",
      currentPassword: "temporary9",
      newPassword: "new-password9",
    }),
    dependencies,
  );
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).code, "service_unavailable");
  assert.deepEqual(state.profileUpdates, []);
});

Deno.test("completePasswordChange reports password-changed pending state when flag clear fails", async () => {
  const passwordActor = {
    ...actor,
    role: "member" as const,
    must_change_password: true,
  };
  const { state, dependencies } = createHarness({
    authenticatedActor: passwordActor,
    updateProfileError: new Error("database unavailable"),
  });
  const response = await handleAdminUsersRequest(
    request({
      action: "completePasswordChange",
      currentPassword: "temporary9",
      newPassword: "new-password9",
    }),
    dependencies,
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await responseBody(response), {
    code: "password_changed_profile_pending",
    message: "密码已修改，但状态更新失败；请使用新密码重试",
  });
  assert.deepEqual(state.events, [
    "current-password-verified",
    "auth-password-updated",
    "profile-updated",
  ]);
});
