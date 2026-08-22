import assert from "node:assert/strict";

import {
  assertAdminActor,
  assertPasswordChangeActor,
  normalizeUsername,
  toInternalEmail,
} from "./policy.ts";

const activeAdmin = {
  id: "admin-id",
  username: "admin",
  role: "admin",
  is_active: true,
  must_change_password: false,
} as const;

Deno.test("member cannot administer accounts", () => {
  assert.throws(
    () =>
      assertAdminActor(
        { ...activeAdmin, id: "member-id", role: "member" },
        "create",
        null,
      ),
    /admin_required/,
  );
});

Deno.test("inactive administrators and administrators awaiting password change are denied", () => {
  assert.throws(
    () =>
      assertAdminActor(
        { ...activeAdmin, is_active: false },
        "list",
        null,
      ),
    /account_inactive/,
  );
  assert.throws(
    () =>
      assertAdminActor(
        { ...activeAdmin, must_change_password: true },
        "list",
        null,
      ),
    /password_change_required/,
  );
});

Deno.test("current account and final active administrator cannot be deactivated", () => {
  assert.throws(
    () =>
      assertAdminActor(activeAdmin, "deactivate", {
        id: activeAdmin.id,
        role: "admin",
        is_active: true,
        activeAdminCount: 2,
      }),
    /self_deactivation/,
  );
  assert.throws(
    () =>
      assertAdminActor(activeAdmin, "deactivate", {
        id: "other-admin",
        role: "admin",
        is_active: true,
        activeAdminCount: 1,
      }),
    /last_admin/,
  );
});

Deno.test("active administrator who completed password change can administer accounts", () => {
  assert.doesNotThrow(() => assertAdminActor(activeAdmin, "create", null));
  assert.doesNotThrow(() =>
    assertAdminActor(activeAdmin, "deactivate", {
      id: "member-id",
      role: "member",
      is_active: true,
      activeAdminCount: 1,
    })
  );
});

Deno.test("password change is available only to an active actor with the flag set", () => {
  assert.doesNotThrow(() =>
    assertPasswordChangeActor({
      ...activeAdmin,
      role: "member",
      must_change_password: true,
    })
  );
  assert.throws(
    () =>
      assertPasswordChangeActor({
        ...activeAdmin,
        is_active: false,
        must_change_password: true,
      }),
    /account_inactive/,
  );
  assert.throws(
    () => assertPasswordChangeActor(activeAdmin),
    /password_change_not_required/,
  );
});

Deno.test("username normalization is strict and creates a non-deliverable internal email", () => {
  assert.equal(normalizeUsername("  Alice.Smith  "), "alice.smith");
  assert.equal(
    toInternalEmail("  Alice.Smith  "),
    "alice.smith@users.workbench.invalid",
  );
  for (
    const invalid of ["ab", "a b c", "-alice", "alice+tag", "a".repeat(33)]
  ) {
    assert.throws(() => normalizeUsername(invalid), /invalid_username/);
  }
});
