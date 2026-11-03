# TEAM UP · 扫码留言墙

纯静态双页面：GitHub Pages + Supabase 数据库 / Realtime。无需 Node 服务。现有 3D 网站和 Cloudflare 测试站不受影响。

## 1. 配置 Supabase

1. 在 https://supabase.com/dashboard 创建项目，等待数据库就绪。
2. 打开项目 **SQL Editor**，复制运行 `supabase/schema.sql` 全部内容。脚本建立 `public.messages`，启用 RLS、限制权限，并将表加入 `supabase_realtime` publication。
3. 若已有同名 `messages` 表，脚本会报错并回滚。先检查原表用途，不要直接删除。此脚本针对新表安装。
4. 从项目的 **Connect** 或 **Settings → API / API Keys** 获取 Project URL 和公开 anon key（新的 publishable key 也支持）。
5. 打开根目录 **config.js**，只改这两项：

```js
window.APP_CONFIG = Object.freeze({
  SUPABASE_URL: "https://你的项目编号.supabase.co",
  SUPABASE_ANON_KEY: "你的 anon 或 sb_publishable_... 公钥"
});
```

公开公钥可以出现在浏览器和仓库中，数据访问由 RLS 控制。**不要填写 service_role、secret key 或数据库密码。** 该应用不需要启用 Supabase Auth 的匿名登录。

## 2. 发布 GitHub Pages

1. 创建 GitHub 仓库（例如 `teamup-message-wall`）。使用 GitHub Free 时，可创建 public 仓库。
2. 将本目录内的页面、`config.js`、`styles.css`、`js/`、`vendor/` 和 `.nojekyll` 放到仓库根目录。保留目录结构，`index.html` 不能被多套一层文件夹。SQL 和文档也可一起保存。
3. 仓库 **Settings → Pages → Build and deployment**：选择 **Deploy from a branch**，再选 **main / (root)**，保存。
4. 等待 Pages 部署完成，打开其实际显示的网址，例如 `https://用户名.github.io/teamup-message-wall/`。
5. 首页会用 qrcode.js 自动生成指向同目录 `submit.html` 的二维码。代码通过相对 URL 解析保留仓库子目录，**不需要手填二维码域名**。

本地用静态服务器预览，例如在此目录运行 `python -m http.server 8785`。本地二维码指向本机，不用于手机远程验收；手机请扫描部署后的 HTTPS 页面。

## 3. 验收

1. 电脑打开首页，状态应为“实时连接”。
2. 手机扫码打开填写页，输入姓名和留言，提交。
3. 电脑页面无需刷新即可显示新留言；手机显示保存成功。
4. 刷新首页，已提交内容仍存在。短暂断网恢复后会自动补读；WebSocket 不通时每 15 秒补读一次。
5. SQL Editor 单独运行 `supabase/verify-rls.sql`：允许 anon 插入/读取，拒绝修改/删除/清空，测试记录自动回滚。

## 数据与权限

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键；客户端为同一次提交复用 ID，处理网络重试 |
| name | text | 姓名，去空格后 1–40 字符 |
| message | text | 留言，去空格后 1–500 字符 |
| created_at | timestamptz | 数据库自动生成，访客不能指定 |

`anon`、`authenticated`：只允许 SELECT 和 INSERT(id,name,message)。没有 UPDATE / DELETE 策略，且明确撤销 UPDATE / DELETE / TRUNCATE 权限。Supabase 项目管理员和 service_role 仍能管理数据，不能把管理密钥放进前端。

访客无需登录，姓名和留言公开可读。此版本没有验证码或服务端限流，不适合直接作为大规模开放投稿服务。页面以纯文本显示输入内容；不会执行用户填写的 HTML。

## 文件与依赖

- `index.html`：二维码和实时留言墙。
- `submit.html`：手机填写页。
- `config.js`：唯一的项目 URL / 公钥配置位置。
- `js/wall.js`：Realtime INSERT 订阅、分页读取全部记录、去重、断线补读。
- `js/submit.js`：校验、提交反馈、失败保留输入、同次重试去重。
- `supabase/schema.sql`：建表、RLS、权限与 Realtime 设置。
- `vendor/`：固定版本 qrcode.js 1.0.0 与 supabase-js 2.49.4，随站点托管。

## 验证边界

仓库内浏览器测试使用真正的 Supabase 浏览器 SDK，REST 与 WebSocket 服务由测试桩模拟。它验证页面交互与同步处理，不代表真实 Supabase 项目已配置。真实 SQL/RLS 和跨设备扫码需在填入项目配置、发布后验收。

更换托管方式不能保证所有地区/校园网络都能访问 GitHub Pages 和 Supabase；以上第 3 节的手机验收是最终标准。

## 官方参考

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [GitHub Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [qrcode.js](https://github.com/davidshimjs/qrcodejs)
