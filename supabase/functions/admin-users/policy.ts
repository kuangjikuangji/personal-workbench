export type Role = "admin" | "member";

export type Profile = {
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
};

export type AdminAction =
  | "list"
  | "create"
  | "activate"
  | "deactivate"
  | "resetPassword";

export type AdminTarget = Pick<Profile, "id" | "role" | "is_active"> & {
  activeAdminCount: number;
};

export class PolicyError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PolicyError";
    this.code = code;
  }
}

export function assertAdminActor(
  profile: Profile,
  action: AdminAction,
  target: AdminTarget | null,
): void {
  if (!profile.is_active) {
    throw new PolicyError("account_inactive");
  }
  if (profile.must_change_password) {
    throw new PolicyError("password_change_required");
  }
  if (profile.role !== "admin") {
    throw new PolicyError("admin_required");
  }

  if (action !== "deactivate" || target === null) {
    return;
  }
  if (target.id === profile.id) {
    throw new PolicyError("self_deactivation");
  }
  if (
    target.role === "admin" && target.is_active &&
    target.activeAdminCount <= 1
  ) {
    throw new PolicyError("last_admin");
  }
}

export function assertPasswordChangeActor(profile: Profile): void {
  if (!profile.is_active) {
    throw new PolicyError("account_inactive");
  }
  if (!profile.must_change_password) {
    throw new PolicyError("password_change_not_required");
  }
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new PolicyError("invalid_username");
  }
  return username;
}

export function toInternalEmail(username: string): string {
  return `${normalizeUsername(username)}@users.workbench.invalid`;
}
