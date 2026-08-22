import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ADMIN_USERNAME = "zhoujingjing";
const ADMIN_EMAIL = `${ADMIN_USERNAME}@users.workbench.invalid`;
const PAGE_SIZE = 1000;

export function readSeedConfig(env) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const initialPassword = env.INITIAL_ADMIN_PASSWORD;
  if (!supabaseUrl || !serviceRoleKey || !initialPassword) {
    throw new Error(
      "请设置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 和 INITIAL_ADMIN_PASSWORD 后再执行初始化",
    );
  }
  if (initialPassword.length < 8) {
    throw new Error("INITIAL_ADMIN_PASSWORD 至少 8 位");
  }
  return { supabaseUrl, serviceRoleKey, initialPassword };
}

async function findAdminUser(client) {
  for (let page = 1;; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) {
      throw new Error("无法查询初始管理员账号");
    }

    const match = data.users.find((user) => user.email === ADMIN_EMAIL);
    if (match) {
      return match;
    }
    if (data.users.length < PAGE_SIZE) {
      return null;
    }
  }
}

export async function seedInitialAdmin(client, initialPassword) {
  if (!initialPassword || initialPassword.length < 8) {
    throw new Error("初始管理员密码至少 8 位");
  }
  let user = await findAdminUser(client);
  let created = false;

  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: initialPassword,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error("无法创建初始管理员账号");
    }
    user = data.user;
    created = true;
  }

  let profileMissing = created;
  if (!created) {
    const { data: existingProfile, error: profileLookupError } = await client
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileLookupError) {
      throw new Error("无法查询初始管理员账号资料");
    }
    profileMissing = !existingProfile;
  }

  if (profileMissing) {
    const { error: profileError } = await client.from("profiles").upsert({
      id: user.id,
      username: ADMIN_USERNAME,
      role: "admin",
      is_active: true,
      must_change_password: true,
    }, { onConflict: "id" });

    if (profileError) {
      if (created) {
        await client.auth.admin.deleteUser(user.id);
      }
      throw new Error("无法初始化管理员账号资料");
    }
  }

  return { created, userId: user.id };
}

async function main() {
  const { supabaseUrl, serviceRoleKey, initialPassword } = readSeedConfig(
    process.env,
  );

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const result = await seedInitialAdmin(client, initialPassword);
  console.log(
    result.created
      ? "初始管理员账号已创建，首次登录后必须修改密码。"
      : "初始管理员账号已存在，未重置现有密码。",
  );
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "初始化失败");
    process.exitCode = 1;
  });
}
