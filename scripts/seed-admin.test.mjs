import assert from "node:assert/strict";
import test from "node:test";

import { readSeedConfig, seedInitialAdmin } from "./seed-admin.mjs";

const INITIAL_PASSWORD = "owner-provided-password";

test("seed configuration requires a private initial password of at least eight characters", () => {
  assert.throws(
    () => readSeedConfig({}),
    /INITIAL_ADMIN_PASSWORD/,
  );
  assert.throws(
    () => readSeedConfig({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      INITIAL_ADMIN_PASSWORD: "short",
    }),
    /至少 8 位/,
  );
});

test("seed configuration keeps the owner password out of its public result", () => {
  const config = readSeedConfig({
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    INITIAL_ADMIN_PASSWORD: INITIAL_PASSWORD,
  });

  assert.deepEqual(Object.keys(config).sort(), [
    "initialPassword",
    "serviceRoleKey",
    "supabaseUrl",
  ]);
  assert.equal(config.initialPassword, INITIAL_PASSWORD);
});

function createFakeClient({
  initialUsers = [],
  initialProfiles = [],
  profileUpsertError = null,
} = {}) {
  const state = {
    users: structuredClone(initialUsers),
    profiles: structuredClone(initialProfiles),
    createInputs: [],
    updateInputs: [],
    deleteInputs: [],
    profileUpserts: [],
  };

  const client = {
    auth: {
      admin: {
        async listUsers({ page, perPage }) {
          const start = (page - 1) * perPage;
          return {
            data: { users: state.users.slice(start, start + perPage) },
            error: null,
          };
        },
        async createUser(input) {
          state.createInputs.push(structuredClone(input));
          const user = {
            id: "admin-user-id",
            email: input.email,
            simulatedPassword: input.password,
          };
          state.users.push(user);
          return { data: { user }, error: null };
        },
        async updateUserById(userId, input) {
          state.updateInputs.push({ userId, input: structuredClone(input) });
          return { data: {}, error: null };
        },
        async deleteUser(userId) {
          state.deleteInputs.push(userId);
          state.users = state.users.filter((user) => user.id !== userId);
          return { data: {}, error: null };
        },
      },
    },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() {
          return {
            eq(column, userId) {
              assert.equal(column, "id");
              return {
                async maybeSingle() {
                  return {
                    data: state.profiles.find((profile) => profile.id === userId) ?? null,
                    error: null,
                  };
                },
              };
            },
          };
        },
        async upsert(profile, options) {
          state.profileUpserts.push({
            profile: structuredClone(profile),
            options: structuredClone(options),
          });
          if (!profileUpsertError) {
            state.profiles = state.profiles.filter((existing) => existing.id !== profile.id);
            state.profiles.push(structuredClone(profile));
          }
          return { error: profileUpsertError };
        },
      };
    },
  };

  return { client, state };
}

test("initial admin seed creates the account once and repeated runs never reset its password", async () => {
  const { client, state } = createFakeClient();

  const first = await seedInitialAdmin(client, INITIAL_PASSWORD);
  state.users[0].simulatedPassword = "user-changed-password";
  const second = await seedInitialAdmin(client, INITIAL_PASSWORD);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(state.createInputs, [{
    email: "zhoujingjing@users.workbench.invalid",
    password: INITIAL_PASSWORD,
    email_confirm: true,
  }]);
  assert.deepEqual(state.updateInputs, []);
  assert.equal(state.users[0].simulatedPassword, "user-changed-password");
  assert.equal(state.profileUpserts.length, 1);
  assert.deepEqual(state.profileUpserts[0], {
    profile: {
      id: "admin-user-id",
      username: "zhoujingjing",
      role: "admin",
      is_active: true,
      must_change_password: true,
    },
    options: { onConflict: "id" },
  });
});

test("reseed preserves every existing profile field and changed password", async () => {
  const existingUser = {
    id: "existing-admin-id",
    email: "zhoujingjing@users.workbench.invalid",
    simulatedPassword: "user-changed-password",
  };
  const existingProfile = {
    id: existingUser.id,
    username: "zhoujingjing",
    role: "member",
    is_active: false,
    must_change_password: false,
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
  };
  const { client, state } = createFakeClient({
    initialUsers: [existingUser],
    initialProfiles: [existingProfile],
  });

  const result = await seedInitialAdmin(client, INITIAL_PASSWORD);

  assert.equal(result.created, false);
  assert.deepEqual(state.profiles, [existingProfile]);
  assert.equal(state.users[0].simulatedPassword, "user-changed-password");
  assert.deepEqual(state.createInputs, []);
  assert.deepEqual(state.updateInputs, []);
  assert.deepEqual(state.profileUpserts, []);
});

test("existing Auth user with missing profile receives initial admin state", async () => {
  const existingUser = {
    id: "existing-admin-id",
    email: "zhoujingjing@users.workbench.invalid",
    simulatedPassword: "user-changed-password",
  };
  const { client, state } = createFakeClient({ initialUsers: [existingUser] });

  const result = await seedInitialAdmin(client, INITIAL_PASSWORD);

  assert.equal(result.created, false);
  assert.deepEqual(state.profileUpserts, [{
    profile: {
      id: existingUser.id,
      username: "zhoujingjing",
      role: "admin",
      is_active: true,
      must_change_password: true,
    },
    options: { onConflict: "id" },
  }]);
  assert.equal(state.users[0].simulatedPassword, "user-changed-password");
});

test("new Auth user is rolled back when initial profile creation fails", async () => {
  const { client, state } = createFakeClient({
    profileUpsertError: { code: "profile_write_failed" },
  });

  await assert.rejects(
    () => seedInitialAdmin(client, INITIAL_PASSWORD),
    /无法初始化管理员账号资料/,
  );

  assert.deepEqual(state.deleteInputs, ["admin-user-id"]);
  assert.deepEqual(state.users, []);
});
