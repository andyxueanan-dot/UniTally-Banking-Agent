# 固定地址部署：Render Free + Neon Free

云端入口为 `backend/cloud-server.js`。原本机 5091/8091 和临时隧道入口不变。

## Render 配置

- 一个 Node Web Service，**Free**，无付费磁盘/worker/cron。
- Region 与现有 Neon 项目一致：Ohio。
- Build：`npm ci --include=dev --no-audit --no-fund && npm --prefix backend ci --omit=dev --no-audit --no-fund && npm run mobile:build`
- Start：`node backend/cloud-server.js`
- Node：`24.14.1`，监听 `0.0.0.0:$PORT`。
- 健康检查：`/healthz`，只返回是否可用，不含会话、余额或密钥。
- `RENDER_EXTERNAL_URL` 提供固定 HTTPS 来源；本地集成测试可使用 `PUBLIC_ORIGIN`。

必须在服务私有环境配置：`DATABASE_URL`（Neon pooled、TLS）、`DATABASE_URL_UNPOOLED`（direct，迁移专用）、`TEAM_ACCESS_PASSWORD`（至少24字符随机口令）。可配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 和 `BANK_MAX_AI_CALLS_PER_DAY=20`；不配置密钥时只允许离线案例。不得使用 VITE_ 前缀存储密钥。

免费不等于不休眠或保证可用：Render 空闲后会休眠，再次打开需要唤醒，网址不因正常重启变化。Neon 免费额度和暂停策略以平台为准。不用保活脚本绕过休眠，不升级付费。

## 云端存储边界

当前为小团队比赛演示：单表 JSON 状态快照，Postgres 行锁保护每次原子变更；SQL 由 Drizzle 构造，版本化迁移位于 `backend/cloud/migrations/`。Node Worker 负责异步数据库 I/O，现有同步权限引擎通过有上限的消息交换调用它，避免重写已测试的资金状态机。

这会短暂阻塞主线程，**不适合大并发或生产银行业务**。单状态上限8 MiB；锁等待5秒，跨线程最多30秒。数据库失败或超时停止返回成功结果；出现提交结果不确定时先查询原任务，不能创建新的付款重试。

- 账本、会话、失败验证锁定、每日模型尝试额度在数据库中保存；模型请求前先提交调用计数，避免重启白用额度。
- 登录 Cookie 为 Secure/HttpOnly/SameSite；Cookie 仅含随机值，数据库保存其散列及到期时间。登录最多8小时，修改团队口令使旧 Cookie 失效。
- 不复制本机账本或真人数据。使用专门的 `unitally-team` Neon 分支，初始云端账户独立。
- 团队分享仅模拟资金；Passkey 与代码执行仍不对公网开放。
- PostgreSQL 持久化不替代备份、金融合规或正式安全认证。

## 验证

`node scripts/check-cloud-storage.cjs` 从忽略提交的 `backend/.env.cloud.local` 读取数据库地址，在唯一 `test-*` 命名空间执行受控模拟测试，不调用模型，也不修改正式 `bank-state`。测试残留小型记录保留作证据，不自动删除云端数据。

迁移只在独立 Neon 分支上验证后用于演示服务；不会修改用户原 `production` 分支或删除资源。

已有本地账号不会自动迁移。固定地址上线后，每位队友重新输入团队口令并创建独立模拟会话。
