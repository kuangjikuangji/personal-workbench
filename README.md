# 个人工作学习工作台

面向高校行政、教学与科研场景的本地优先 React PWA。

## 在线访问

- GitHub Pages：<https://kuangjikuangji.github.io/personal-workbench/>
- 支持从 Chrome/Edge 安装为 PWA；Supabase 是业务数据的最终持久化来源，浏览器 IndexedDB 是离线镜像和待同步队列。
- 工作台使用 Supabase 账号登录，首次登录后需要修改初始密码。

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

## 云端归属与离线同步

每条业务记录都归属于当前 Supabase 账号，Row Level Security 要求
`auth.uid() = user_id`。同一账号在多个终端登录时共享云端业务数据；
不同账号不能相互读写。主题、通知去重和 PWA 安装状态等终端偏好
继续留在本机，不参与跨端同步。

界面始终先读写 IndexedDB：断网时仍可新增、修改和删除，操作会保存在
持久化队列中，刷新页面后仍然存在；恢复网络、页面重新聚焦或 Realtime
重连后会自动核对云端并上传队列。冲突采用“最后修改者优先”：比较客户端
`updated_at`，删除则作为带 `deleted_at` 的版本参与比较；时间更新的
完整记录或删除胜出。

账号区域显示同步状态：

- `已同步`：待上传队列为空且 Realtime 已连接。
- `正在同步`：正在拉取、上传或合并云端变化。
- `离线，N 项待同步`：可继续本地操作，恢复联网后自动上传。
- `同步失败`：队列保留在本地，可选择“重试”。

退出登录会停止 Realtime 和同步引擎，并清除该浏览器中当前账号的
业务镜像与待同步队列。在仍显示“离线，N 项待同步”时不要退出登录或
清除站点数据。

## 同步验收账号

跨终端 Playwright 用例只从 `E2E_SYNC_USERNAME` 和
`E2E_SYNC_PASSWORD` 读取一个已完成首次改密的可丢弃账号。两者缺少
时用例会明确跳过；不存在默认账号或密码。运行：

```bash
E2E_SYNC_USERNAME="<disposable-username>" \
E2E_SYNC_PASSWORD="<disposable-password>" \
npx playwright test e2e/realtime-sync.spec.ts --project=chromium-desktop
```

用例使用同一账号的两个独立浏览器上下文，并为每次运行生成唯一待办
名称。正常流程和失败收尾都尽可能通过界面删除该记录；不得将上述环境
变量的值打印到日志、写入仓库或前端构建。GitHub Actions 使用同名的
Actions secrets，而公开的构建配置仍使用 `VITE_SUPABASE_URL` 和
`VITE_SUPABASE_ANON_KEY` repository variables。

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

已链接且经运维确认的托管项目发布流程：

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase config push
```

先审查 dry-run 只包含预期迁移，再执行真实推送。发布后应验证 14 张
业务表都在 `supabase_realtime` publication 中，RLS 仍阻止跨账号读写，
冲突 RPC 仍保留较新版本。这些命令会修改远程状态，只能对已明确选定的
项目由运维人员执行。

初始管理员脚本要求仅存在于运维环境的 `SUPABASE_URL`、
`SUPABASE_SERVICE_ROLE_KEY` 和 `INITIAL_ADMIN_PASSWORD`：

```bash
SUPABASE_URL="<project-url>" \
SUPABASE_SERVICE_ROLE_KEY="<server-only-key>" \
INITIAL_ADMIN_PASSWORD="<owner-provided-initial-password>" \
npm run supabase:seed-admin
```

首次运行会创建内部账号 `zhoujingjing`，并要求登录后立即改密。
重复运行不会重置已存在的 Auth 密码。不得将初始密码或 service-role key
写入前端环境变量、GitHub Pages 构建变量、Git 或浏览器产物。

## 故障恢复

1. 显示“离线”时先恢复网络，保持页面和站点数据，等待状态回到“已同步”。
2. 显示“同步失败”时选择“重试”；同时检查网络、Supabase 服务状态、账号是否有效，以及 Pages 构建使用的公开 URL/anon key 是否正确。
3. 队列持续不为空时不要退出登录、清除站点数据或重装 PWA；保留现场并检查浏览器中的简短错误与 Supabase 日志，不要导出会话令牌或密码。
4. 仅当状态已回到“已同步”且确认云端数据完整时，才可退出并重新登录，以从 Supabase 重建本地镜像。
