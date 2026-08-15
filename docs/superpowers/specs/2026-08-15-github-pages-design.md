# GitHub Pages 在线部署设计

## 目标

将当前 React + TypeScript PWA 发布到项目站点：
`https://kuangjikuangji.github.io/personal-workbench/`，并在每次向 `master`
推送代码后自动构建和更新。

## 路由与资源路径

- 生产构建的 Vite `base` 设为 `/personal-workbench/`，使 JavaScript、CSS、
  图标和 Service Worker 在 GitHub Pages 子路径下正确加载。
- 应用使用 `HashRouter`，内部地址形如
  `/personal-workbench/#/todos`。路由状态位于 URL hash 中，所以 GitHub Pages
  始终只需返回项目首页，刷新子页不会出现 404。
- 本地 `npm run dev` 仍使用 Vite 开发服务器，不改变日常开发方式。

## PWA 行为

- Manifest 的 `start_url` 和 `scope` 使用 GitHub Pages 项目根路径。
- 安装后从项目根路径启动，再由 HashRouter 管理应用内导航。
- Service Worker 及预缓存资源跟随 Vite `base`，不控制 GitHub
  个人站点下的其他项目。

## 自动部署

新增 GitHub Actions 工作流，当 `master` 更新时：

1. 检出代码并安装指定 Node.js LTS。
2. 使用 `npm ci` 还原锁定依赖。
3. 运行类型检查、单元测试和生产构建。
4. 上传 `dist` 为 GitHub Pages artifact。
5. 使用 GitHub 官方 Pages Action 部署。

工作流仅申请读取代码、写入 Pages 和生成 OIDC 令牌所需的最小权限，
并使用 concurrency 取消过时的排队部署。

## GitHub 设置

将仓库 Pages 构建源设为 GitHub Actions。第一次部署成功后，GitHub
会在仓库 Pages 设置中显示站点地址。

## 验证与失败处理

- 本地门禁：单元测试、类型检查、生产构建。
- 构建产物检查：`dist/index.html`、`manifest.webmanifest` 和 `sw.js`
  存在，且 HTML 资源 URL 包含 `/personal-workbench/`。
- 线上检查：首页、待办、日历、Manifest 和 Service Worker 可访问；
  桌面与手机尺寸均能导航。
- 如 Actions 失败，保留上一次成功部署，并从工作流日志定位构建或
  Pages 权限问题，不手工上传未验证的 `dist`。

## 范围

本次只完成 GitHub Pages 托管。不接入 Supabase，不更改当前 IndexedDB
本地数据模型，不增加自定义域名。
