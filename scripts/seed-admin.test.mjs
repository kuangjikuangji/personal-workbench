import assert from "node:assert/strict";
import test from "node:test";

import { seedInitialAdmin } from "./seed-admin.mjs";

function createFakeClient(initialUsers = []) {
  const state = {
    users: structuredClone(initialUsers),
    createInputs: [],
    updateInputs: [],
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
          state.users = state.users.filter((user) => user.id !== userId);
          return { data: {}, error: null };
        },
      },
    },
    from(table) {
      assert.equal(table, "profiles");
      return {
        async upsert(profile, options) {
          state.profileUpserts.push({
            profile: structuredClone(profile),
            options: structuredClone(options),
          });
          return { error: null };
        },
      };
    },
  };

  return { client, state };
}

test("initial admin seed creates the account once and repeated runs never reset its password", async () => {
  const { client, state } = createFakeClient();

  const first = await seedInitialAdmin(client);
  state.users[0].simulatedPassword = "user-changed-password";
  const second = await seedInitialAdmin(client);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.deepEqual(state.createInputs, [{
    email: "admin@users.workbench.invalid",
    password: "admin123",
    email_confirm: true,
  }]);
  assert.deepEqual(state.updateInputs, []);
  assert.equal(state.users[0].simulatedPassword, "user-changed-password");
  assert.equal(state.profileUpserts.length, 2);
  assert.deepEqual(state.profileUpserts[1], {
    profile: {
      id: "admin-user-id",
      username: "admin",
      role: "admin",
      is_active: true,
      must_change_password: true,
    },
    options: { onConflict: "id" },
  });
});
