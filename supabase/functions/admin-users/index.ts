import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.112.3";

import {
  type AdminGateway,
  AdminUsersError,
  handleAdminUsersRequest,
  type HandlerDependencies,
  type Profile,
  type ProfileSummary,
} from "./handler.ts";

type ProfileRow = {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at?: string;
  updated_at?: string;
};

const PROFILE_COLUMNS =
  "id,username,role,is_active,must_change_password,created_at,updated_at";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required Edge Function environment: ${name}`);
  }
  return value;
}

function clientOptions(headers?: Record<string, string>) {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: headers ? { headers } : undefined,
  };
}

function profileFromRow(row: ProfileRow): Profile {
  if (row.role !== "admin" && row.role !== "member") {
    throw new AdminUsersError("service_unavailable");
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
  };
}

function profileSummaryFromRow(row: ProfileRow): ProfileSummary {
  if (!row.created_at || !row.updated_at) {
    throw new AdminUsersError("service_unavailable");
  }
  return {
    ...profileFromRow(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function throwAdminFailure(
  error: { code?: string; status?: number; message?: string } | null,
  duplicateMeansUsernameExists = false,
): never {
  if (
    duplicateMeansUsernameExists &&
    (error?.code === "23505" || error?.code === "email_exists" ||
      error?.status === 422 ||
      error?.message?.toLowerCase().includes("already"))
  ) {
    throw new AdminUsersError("username_exists");
  }
  throw new AdminUsersError("service_unavailable");
}

function createGateway(serviceClient: SupabaseClient): AdminGateway {
  return {
    async listProfiles() {
      const { data, error } = await serviceClient
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .order("created_at", { ascending: true });
      if (error) {
        throwAdminFailure(error);
      }
      return (data as ProfileRow[]).map(profileSummaryFromRow);
    },

    async getProfile(userId) {
      const { data, error } = await serviceClient
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        throwAdminFailure(error);
      }
      return data ? profileSummaryFromRow(data as ProfileRow) : null;
    },

    async countActiveAdmins() {
      const { count, error } = await serviceClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if (error || count === null) {
        throwAdminFailure(error);
      }
      return count;
    },

    async createAuthUser({ email, password }) {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throwAdminFailure(error, true);
      }
      return { id: data.user.id };
    },

    async deleteAuthUser(userId) {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) {
        throwAdminFailure(error);
      }
    },

    async upsertProfile(profile) {
      const { data, error } = await serviceClient
        .from("profiles")
        .upsert(profile, { onConflict: "id" })
        .select(PROFILE_COLUMNS)
        .single();
      if (error || !data) {
        throwAdminFailure(error, true);
      }
      return profileSummaryFromRow(data as ProfileRow);
    },

    async updateAuthPassword(userId, password) {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) {
        throwAdminFailure(error);
      }
    },

    async updateProfile(userId, patch) {
      const { data, error } = await serviceClient
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error || !data) {
        throwAdminFailure(error);
      }
      return profileSummaryFromRow(data as ProfileRow);
    },
  };
}

export function createHandlerDependencies(
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
): HandlerDependencies {
  const authClient = createClient(supabaseUrl, anonKey, clientOptions());

  return {
    async authenticate(accessToken) {
      const { data: userData, error: userError } = await authClient.auth
        .getUser(
          accessToken,
        );
      if (userError || !userData.user) {
        return null;
      }

      const actorClient = createClient(
        supabaseUrl,
        anonKey,
        clientOptions({ Authorization: `Bearer ${accessToken}` }),
      );
      const { data, error } = await actorClient
        .from("profiles")
        .select("id,username,role,is_active,must_change_password")
        .eq("id", userData.user.id)
        .single();
      if (error || !data) {
        return null;
      }
      return profileFromRow(data as ProfileRow);
    },

    async verifyPassword(email, password) {
      const verificationClient = createClient(
        supabaseUrl,
        anonKey,
        clientOptions(),
      );
      const { data, error } = await verificationClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        return null;
      }
      return data.user.id;
    },

    createAdminGateway() {
      const serviceClient = createClient(
        supabaseUrl,
        serviceRoleKey,
        clientOptions(),
      );
      return createGateway(serviceClient);
    },
  };
}

const dependencies = createHandlerDependencies(
  requiredEnvironment("SUPABASE_URL"),
  requiredEnvironment("SUPABASE_ANON_KEY"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
);

Deno.serve((request) => handleAdminUsersRequest(request, dependencies));
