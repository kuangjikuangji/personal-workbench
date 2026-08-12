# 个人工作学习工作台

面向高校行政、教学与科研场景的本地优先 React PWA。

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
