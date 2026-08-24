# Bili Manager

一个用于管理 Bilibili 账号和配置的 Web 应用，基于 Next.js 构建。

## 功能特性

- 🔐 安全管理多个 Bilibili 账号
- 📁 自动解析 Netscape 格式的 Cookies 文件
- 🔔 集成 Server 酱推送服务
- 🎨 现代化 UI 设计 (Shadcn UI)
- 🌙 支持深色模式
- 💾 使用 Supabase 作为数据库

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS v4
- **UI 组件**: Shadcn UI
- **数据库**: Supabase (PostgreSQL)
- **部署**: Vercel

## 本地开发

### 前置要求

- Node.js 18+
- npm / yarn / pnpm
- Supabase 账号

### 安装步骤

1. 克隆仓库
```bash
git clone <your-repo-url>
cd bili-manager
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量

创建 `.env` 文件（或编辑 `env.txt`，它已被硬链接到 `.env`）：

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

4. 设置 Supabase 数据库

在 Supabase Dashboard 的 SQL Editor 中执行 `supabase_schema.sql` 文件中的 SQL 语句。

5. 启动开发服务器
```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## Vercel 部署指南

### 步骤 1: 准备 Supabase 数据库

1. 访问 [Supabase](https://supabase.com/) 并创建一个新项目（如果还没有）
2. 进入项目的 **SQL Editor**
3. 复制 `supabase_schema.sql` 文件的内容并执行，创建 `bili_account` 表
4. 在项目设置中找到以下信息（Settings → API）：
   - `Project URL` (例如: `https://xxxxx.supabase.co`)
   - `anon/public key` (以 `eyJhbGci...` 开头的长字符串)

### 步骤 2: 部署到 Vercel

#### 方式一：通过 Vercel Dashboard（推荐）

1. 访问 [Vercel](https://vercel.com) 并登录
2. 点击 **Add New** → **Project**
3. 导入你的 Git 仓库（GitHub / GitLab / Bitbucket）
4. 配置项目：
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`（默认）
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）

5. 添加环境变量（Environment Variables）：

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

6. 点击 **Deploy**，等待部署完成

#### 方式二：通过 Vercel CLI

1. 安装 Vercel CLI
```bash
npm i -g vercel
```

2. 登录 Vercel
```bash
vercel login
```

3. 在项目根目录运行
```bash
vercel
```

4. 按照提示完成配置，选择项目设置

5. 添加环境变量
```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

6. 重新部署以应用环境变量
```bash
vercel --prod
```

### 步骤 3: 验证部署

1. 访问 Vercel 提供的部署 URL（例如：`https://your-project.vercel.app`）
2. 尝试添加一个账号，上传 cookies.txt 文件
3. 检查是否能正常创建、编辑和删除账号

### 常见问题

**Q: 部署后出现数据库连接错误？**

A: 检查环境变量是否正确设置，确保 `SUPABASE_URL` 和服务端专用的 `SUPABASE_SERVICE_ROLE_KEY` 都已配置。

**Q: 如何更新环境变量？**

A: 在 Vercel Dashboard → 你的项目 → Settings → Environment Variables 中修改，修改后需要重新部署（Deployments → Redeploy）。

**Q: Cookies 文件格式要求？**

A: 支持 Netscape 格式的 cookies.txt 文件。推荐使用 Chrome 浏览器插件 [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) 导出。步骤：
1. 在 Chrome 安装插件
2. 访问 bilibili.com 并登录
3. 点击插件图标，选择 "Export" 导出 cookies.txt

**Q: Server 酱 SendKey 如何获取？**

A: 访问 [https://sct.ftqq.com/](https://sct.ftqq.com/)，微信扫码登录后，进入 SendKey 页面复制密钥。

## 使用说明

### 添加账号

1. 点击 "添加账号" 按钮
2. 输入账号名称（自定义，例如"我的大号"）
3. 粘贴从 B 站导出的 Cookies 内容，或上传 cookies.txt 文件
4. （可选）填入 Server 酱推送密钥
5. 点击 "创建"

### 编辑账号

1. 点击账号卡片上的编辑图标
2. 可以修改账号名称、更新 Cookies、或更换 Server 酱密钥
3. 点击 "更新"

### 删除账号

点击账号卡片上的删除图标，确认后即可删除。

## Chrome 扩展一键上传

仓库内置了一个本地 Chrome 扩展，路径为 `chrome-extension/`。它是自包含工具，不依赖 Next.js 应用运行，只复用同一个 Supabase 表结构和字段。

扩展会读取当前 Chrome 中的 Bilibili Cookie，通过受保护的
`bili-cookie-upload` Edge Function 更新 `bili_account`。浏览器端没有
`service_role` 权限。

### 扩展配置

扩展需要配置 Supabase 的 `Project URL` 和该账号独立的 Cookie 上传令牌。
上传令牌只保存在
`chrome.storage.local`。

### 安装扩展

1. 打开 Chrome 的 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本仓库的 `chrome-extension/` 目录
5. 点击扩展图标，填写 Supabase URL 和 Cookie 上传令牌
6. 在 Chrome 中登录 B 站后，点击「上传当前 B 站 Cookie」

扩展会监听 `SESSDATA`、`bili_jct`、`buvid3` 和 `DedeUserID` 的变化，
变化后等待 30 秒自动同步，并每 6 小时复核一次。Chrome 必须处于运行状态，
B站登录完全失效时需要重新登录。账号名称留空时使用 B站账号名称或 UID。

## 安全说明

- ⚠️ Cookies、Cookie 上传令牌和 Server 酱密钥包含敏感信息，请勿分享给他人
- 🔑 Chrome 扩展会在本机保存账号级上传令牌，只建议个人自用
- 🔒 本项目使用 Supabase RLS（行级安全）保护数据
- 🔐 编辑账号时，敏感密钥会进行脱敏显示
- 🚫 不同账号的用户 ID 不可互相替换

## 开发原则

本项目遵循以下开发原则：

- **MVP**: 只实现必要功能，保持简洁
- **Never Nesting**: 嵌套不超过 3 层
- **解耦**: 每个模块只做一件事
- **Let it Crash**: 让错误自然暴露

## License

MIT
