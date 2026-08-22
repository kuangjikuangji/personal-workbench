# 个人工作学习工作台

面向高校行政、教学与科研场景的本地优先 React PWA。

## 在线访问

- GitHub Pages：<https://kuangjikuangji.github.io/personal-workbench/>
- 支持从 Chrome/Edge 安装为 PWA；数据当前保存在本机浏览器 IndexedDB 中。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址。生产预览使用：

```bash
npm run build
npm run preview
```

Chrome/Edge 地址栏出现安装图标后可安装为独立应用；手机端使用浏览器“添加到主屏幕”。

其他可用脚本：`npm run typecheck`、`npm run test:run` 与 `npm run test:e2e`。

首版仅在浏览器本地保存数据；不会接入账号、Supabase 同步或自动监听微信消息。

## Supabase 账号管理开发

Supabase 账号不支持公开注册。`admin-users` Edge Function 先校验 bearer JWT 和
当前账号资料，再允许已完成首次改密的有效管理员列出、新建、启停或重置账号。
不允许停用自己或最后一个有效管理员。首次改密通过同一 Function 的
`completePasswordChange` action 完成：先用当前密码重新验证 bearer 对应的本人，
成功更新 Auth 密码后才清除本人的 `must_change_password` 标记。

Function 只允许以下精确 Origin：

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://kuangjikuangji.github.io`

本地 Supabase 验证可执行：

```bash
npx supabase start
npx supabase db reset
npx supabase functions serve admin-users
```

初始管理员脚本要求仅存在于运维环境的 `SUPABASE_URL` 和
`SUPABASE_SERVICE_ROLE_KEY`：

```bash
SUPABASE_URL="<project-url>" \
SUPABASE_SERVICE_ROLE_KEY="<server-only-key>" \
npm run supabase:seed-admin
```

首次运行会创建内部账号 `admin`，并要求登录后立即改密。重复运行不会重置
已存在的 Auth 密码。不得将 service-role key 写入前端环境变量、GitHub Pages
构建变量、Git 或浏览器产物。
