import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ADMIN_EMAIL = "admin@users.workbench.invalid";
const PAGE_SIZE = 1000;

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

export async function seedInitialAdmin(client) {
  let user = await findAdminUser(client);
  let created = false;

  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: "admin123",
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error("无法创建初始管理员账号");
    }
    user = data.user;
    created = true;
  }

  const { error: profileError } = await client.from("profiles").upsert({
    id: user.id,
    username: "admin",
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

  return { created, userId: user.id };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "请设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 后再执行初始化",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const result = await seedInitialAdmin(client);
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
