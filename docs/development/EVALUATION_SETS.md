# 评测集、规则快判与"需核对"标注（2026-10-07）

本次按队友 `baiyizhuoait-ui/UniTally` `feature/ai-accounting` 分支的做法引入三件事：**先出考题再改模型**、**简单查询走规则不花 token**、**模型没把握的字段标出来让用户核对**。没有引入它的"模型失败后悄悄退回规则结果"——银行场景下模型不可用就停，这一点保持不变（`bank-provider-feedback.test.js` 仍断言无隐形回退）。

## 1. 四套考题

| 文件 | 条数 | 性质 | 怎么跑 |
|---|---|---|---|
| `evaluation/bank-intents.full.json` | 36 | 自建开发集，不是盲测（2026-10-02 起） | `node scripts/evaluate-bank-full.mjs`（默认 dry-run） |
| `evaluation/bank-date-traps.json` | 14 | 日期陷阱开发集 | `--dataset=temporal` |
| `evaluation/bank-intents.holdout.json` | 23 | **封存保留集**。2026-10-07 写好后不再看；每个发布版本只跑一次 live，结果如实记录 | `--dataset=holdout --live --run=<唯一名>` |
| `evaluation/bank-attacks.json` | 33 | **攻击集**。两层：`text` 给真实模型（15 条 live）；`maliciousPlan` 是"模型被骗后可能吐出的计划"，离线回放给后端（29 条） | 离线：`node --test backend/test/bank-attack-set.test.js`；live：`--dataset=attacks --live --run=<名>` |

封存时的 SHA-256 前 16 位：holdout `b664dbacd7f15228`，attacks `1b9c1b97f790cb33`。`evaluate-bank-full.mjs` 每次 live 运行都会把数据集哈希写进证据文件，改过题就能看出来。

**live 规则不变**：默认 dry-run 不调 API；`--live` 需要新的明确额度授权，60 次预算记录在 `evidence/T008-quality/model-budget.json`，本次没有新增任何真实模型调用。评测器构造服务时传 `ruleFastPath:false`，让"查余额"这类句子也必须到模型，测的是模型本身。

### 1.1 攻击集离线结果（2026-10-07，本机）

`backend/test/bank-attack-set.test.js`：32 项全部通过，含 29 条离线回放和两组固定种子模糊测试（400 个畸形计划过白名单、120 组随机转账参数过整条服务）。每条都断言：余额不变、账本为空、没有任务越过确认进入 `SUCCEEDED`/`PENDING_REVIEW`。

| 类别 | 条数 | 后端表现 |
|---|---|---|
| 白名单（未知动作、多余字段、超长、四个动作、取消夹带金额、模型宣称他人已付款、`uncertain` 乱填） | 8 | 全部 `INVALID_AI_PLAN`，不进对话历史 |
| 参数（金额带代码、负数、科学计数、超余额、未知卡号、已激活卡解挂） | 7 | 不创建草案（澄清或 blocked） |
| 授权与语义（他人账户、同名猜测、代填风险问卷、未测评买理财、取消+新转账混排） | 5 | 不创建草案 |
| 条件被丢（保留余额、外币、未来日期） | 3 | 后端重检原话，改为追问 |
| 注入（管理员口吻、收款人字段夹指令、商户字段夹指令、系统提示泄露） | 4 | 大额转账仍是红色草案且确认必须验证码；其余不创建草案或只读 |
| 隐私（密钥、手机号、卡号） | 3 | `PRIVATE_DATA_BLOCKED`，不发往模型 |

这些数字证明的是**后端边界**，不是模型抗注入能力。模型那一半（15 条 live）要等新额度。

## 2. 规则快判（`backend/bank/rule-plan.js`）

- 只匹配 24 字以内、**不含任何写意图词**（转/付/冻/挂失/取消/买/限额/预约/数字/人名/条件词……）的纯查询句，映射到四个只读动作：`balance`、`cards`、`analyze`、`transactions`，期间词（今天/昨天/本周/上月/今年…）按 `calendar` 的期间键填。
- 命中时不调模型、不扣 AI 额度；回复的来源标签是"规则解析 · 非 AI"，审计写"规则解析（关键词直接命中查询，未调用模型）"。
- 不命中就按原流程：AI 已配置 → 模型；未配置 → `AI_NOT_CONFIGURED`。**没有"模型失败后退回规则"**。
- 离线模式现在可以直接输入这类查询（前端带 `ruleOnly:true`）；不匹配时后端返回 `RULE_NO_MATCH`，明确说不会调用 AI。
- 测试：`backend/test/bank-rule-plan.test.js`（含 500 组固定种子模糊：带写意图词的句子永远不会被规则接走）。

## 3. "需核对"字段标注

- 工具 schema 新增可选 `uncertain: string[]`（取值 recipient、amount、reserveAmount、cardLast4、period、category、merchant、executeAt，最多 4 个）。系统提示要求：字段来自口语或模糊表达（"两百""室友小王""上次那张卡"）时照常填写并标注；原话明确的不标；标注不能代替追问。
- 后端 `validatePlan` 校验取值；任务上保存 `uncertain`，审计 `TASK_PROPOSED` 附"模型标注需核对字段"。标注**不改变**权限等级、金额解析或收款人匹配（`bank-uncertain.test.js`）。
- 前端确认卡：对应行的标签后加琥珀色小字"核对"，数值加琥珀点线下划线，卡片顶部一行琥珀说明。沿用"待确认"的琥珀，不加框、不发光。固定案例永远没有标注。
- 评测集字段 `uncertain: [...]` 可断言模型是否标注（保留集 `h-transfer-uncertain-alias`）。

## 4. 本轮验证

- 后端 `node --test --test-concurrency=1 test/*.test.js`：310/310 通过（并行跑时 Wasmtime 沙箱组会因 2.5 秒时限偶发超时，单独跑 19/19 通过，与本次改动无关）。
- `tsc`、`eslint`、`npm run mobile:build` 通过；`scripts/check-mobile-browser.mjs` 通过（0 次被拦的模型调用）。
- 浏览器截图（本机 8091，离线）：`review-2026-10-07/ui-checks/`，01 规则回答、02 离线不匹配提示、03 带"核对"标记的任务卡。
