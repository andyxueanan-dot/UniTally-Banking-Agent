# 团队怎么一起修改

我们共用这个仓库，不需要每人各建一份。**公开只表示人人能看，不表示人人能直接修改。** 拥有者邀请的协作者接受邀请后，才有写权限；请勿共用GitHub账号、密码或令牌。

## 不写代码的队友

- 按 [README](README.md) 打开本机演示、体验功能。
- 在 [问题反馈](https://github.com/andyxueanan-dot/UniTally-Banking-Agent/issues) 留下“操作步骤、预期结果、实际结果、截图”。
- 不要提交API密钥、账号密码、证件、真实账单或会话令牌。

## 写代码的队友

1. `main` 留作大家共同体验的版本。
2. 每项修改新建分支，例如 `feat/andy-bill-search` 或 `fix/name-transfer-confirm`。
3. 推送分支，创建合并请求，简要说明改了什么、怎么验证。
4. 请另一位队友看过后再合并到 `main`；不要直接覆盖别人的代码。

以上是团队约定，不代表仓库已经设置了强制审批或分支保护。仓库刚建立时，仅拥有者有直接写权限；队友还需单独邀请并接受。

## 密钥与本机环境

- DeepSeek密钥只放自己的 `backend/.env.bank.local`，该文件被Git忽略。
- `backend/.env.bank.example` 只有空值和示例，可以共享。
- `backend/data/`、`.cache/`、`.venv-sandbox/`、`node_modules/`、`dist/` 不上传。
- 不要执行 `git add -f` 绕过这些保护。每人用自己的演示账户与有权使用的密钥。
- 原项目作者与来源见 [来源说明](SOURCE_PROVENANCE.md)，比赛材料需如实区分已有基础、开源依赖和团队新增实现。
