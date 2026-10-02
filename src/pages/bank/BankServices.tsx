import { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  CircleHelp,
  CreditCard,
  ReceiptText,
  Wallet,
  Pause,
  Play,
  X,
  Network,
  Check,
  Clock3,
  Braces,
} from "lucide-react";
import type {
  BankState,
  BankWorkflow,
  BankSandboxStatus,
  BankSandboxResponse,
} from "@/lib/bankApi";
import BankAdvancedServices from "./BankAdvancedServices";
import BankCodeSandbox from "./BankCodeSandbox";
import CardPaymentDemo from './CardPaymentDemo';

const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    cents / 100,
  );
const date = (at: number) =>
  new Date(at).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const labels: Record<string, string> = {
  READY: "可继续下一步",
  PENDING: "等待上游步骤",
  AWAITING_CONFIRMATION: "等待逐项确认",
  WAITING_CONFIRMATION: "等待逐项确认",
  WAITING_SETTLEMENT: "等待后台对账",
  SUCCEEDED: "已完成",
  PAUSED: "已暂停",
  HANDOFF: "已生成本地接管记录",
  CANCELLED: "已取消",
  FAILED: "失败，未继续",
  NEEDS_ATTENTION: "需要处理",
};
const actionNames: Record<string, string> = {
  balance: "查询余额",
  analyze: "分析账单",
  transactions: "查询交易",
  transfer: "准备转账",
  freeze_card: "准备挂失卡片",
  cards: "查询卡片",
  subscription_query: "查询订阅",
  cancel_subscription: "取消指定订阅范围",
  wealth_buy: "模拟申购",
};
export type ManualAction = { type: string; [key: string]: unknown };

export function WorkflowPanel({
  workflows,
  busy,
  onControl,
  onDemo,
}: {
  workflows: BankWorkflow[];
  busy: boolean;
  onControl: (id: string, action: string) => void;
  onDemo: () => void;
}) {
  return (
    <section className="ba-panel ba-workflow-panel">
      <div className="ba-panel-heading">
        <div>
          <span className="ba-section-kicker">ONE REQUEST, CLEAR STEPS</span>
          <h2>多步骤，也不跳过你的确认。</h2>
        </div>
        <Network size={23} />
      </div>
      <p className="ba-service-intro">
        把查询、转账和查验串起来。每一步只在上游完成后推进；敏感操作仍需要单独授权。
      </p>
      <button className="ba-secondary" disabled={busy} onClick={onDemo}>
        体验多步骤固定案例
        <ArrowRight size={15} />
      </button>
      <p className="ba-service-caption">此按钮始终运行固定案例，不调用 AI。</p>
      {workflows.map((flow) => (
        <article
          className="ba-workflow"
          key={flow.id}
          data-testid={`workflow-${flow.id}`}
        >
          <div className="ba-workflow-title">
            <strong>{labels[flow.status] || flow.status}</strong>
            <span>
              {flow.nodes.filter((n) => n.status === "SUCCEEDED").length}/
              {flow.nodes.length} 步
            </span>
          </div>
          <p>{flow.goal}</p>
          <ol>
            {flow.nodes.map((node, i) => (
              <li
                key={node.id}
                className={`ba-flow-node ${node.status === "SUCCEEDED" ? "complete" : ""}`}
              >
                <span>
                  {node.status === "SUCCEEDED" ? <Check size={13} /> : i + 1}
                </span>
                <div>
                  <strong>
                    {actionNames[node.action.type] || node.action.type}
                  </strong>
                  <small>{labels[node.status] || node.status}</small>
                  <small>
                    依赖：
                    {node.dependsOn.length
                      ? node.dependsOn.join("、")
                      : "无，可先进行"}
                  </small>
                  {node.receiptId && <code>执行回执 {node.receiptId}</code>}
                  {node.error && <p>{node.error}</p>}
                </div>
              </li>
            ))}
          </ol>
          {flow.handoff && (
            <p className="ba-handoff-note">
              <CircleHelp size={15} />
              {flow.handoff.note}
            </p>
          )}
          <div className="ba-flow-actions">
            {flow.status === "READY" && (
              <button
                className="ba-primary"
                disabled={busy}
                onClick={() => onControl(flow.id, "advance")}
              >
                <Play size={14} />
                准备下一步
              </button>
            )}
            {["PAUSED", "HANDOFF", "NEEDS_ATTENTION"].includes(flow.status) && (
              <button
                className="ba-primary"
                disabled={busy}
                onClick={() => onControl(flow.id, "resume")}
              >
                <Play size={14} />
                恢复工作流
              </button>
            )}
            {!["PAUSED", "HANDOFF", "CANCELLED", "SUCCEEDED"].includes(
              flow.status,
            ) && (
              <button
                className="ba-secondary"
                disabled={busy}
                onClick={() => onControl(flow.id, "pause")}
              >
                <Pause size={14} />
                暂停
              </button>
            )}
            {!["CANCELLED", "SUCCEEDED"].includes(flow.status) && (
              <>
                <button
                  className="ba-secondary"
                  disabled={busy}
                  onClick={() => onControl(flow.id, "handoff")}
                >
                  生成接管记录
                </button>
                <button
                  className="ba-link-button"
                  disabled={
                    busy ||
                    flow.nodes.some((n) => n.status === "WAITING_SETTLEMENT")
                  }
                  onClick={() => onControl(flow.id, "cancel")}
                >
                  <X size={14} />
                  取消未执行步骤
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

export default function BankServices({
  state,
  busy,
  now,
  onPrepare,
  onWorkflow,
  onWorkflowDemo,
  loadSandboxStatus,
  onSandboxCompute,
  compact = false,
}: {
  compact?: boolean;
  state: BankState;
  busy: boolean;
  now: number;
  onPrepare: (action: ManualAction) => void;
  onWorkflow: (id: string, action: string) => void;
  onWorkflowDemo: () => void;
  loadSandboxStatus: () => Promise<BankSandboxStatus>;
  onSandboxCompute: (
    wat: string,
    inputs: [string, string],
  ) => Promise<BankSandboxResponse | undefined>;
}) {
  const [section, setSection] = useState(compact ? "" : "subscriptions");
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
  const [productId, setProductId] = useState("demo-flex");
  const [amount, setAmount] = useState("");
  const [redeem, setRedeem] = useState<Record<string, string>>({});
  const [creditAmounts, setCreditAmounts] = useState<Record<string, string>>(
    {},
  );
  const b = state.business;
  if (!b)
    return (
      <section className="ba-panel">
        <h2>服务中心需要更新后的后台</h2>
        <p className="ba-service-intro">
          请刷新账户状态。此页面不会用虚构前端结果代替后台业务。
        </p>
      </section>
    );
  return (
    <>
      {compact && section && <button className="bm-service-back ba-link-button" onClick={() => setSection('')}>← 全部服务</button>}
      {(!compact || !section) && <section className={`ba-panel ba-service-header ${compact ? 'bm-service-directory' : ''}`}>
        <div className="ba-panel-heading">
          <div>
            <span className="ba-section-kicker">MORE THAN A CONVERSATION</span>
            <h2>{compact ? '选择你需要的服务' : '把日常金融，办得明明白白。'}</h2>
          </div>
          <ShieldCheck size={23} />
        </div>
        <p className="ba-service-intro">
          这里的表单直接准备业务，不调用
          AI。提交不代表执行，仍需核对任务卡并授权。全部为本地虚构账户。
        </p>
        <div className="ba-service-tabs" role="group" aria-label="服务分类">
          {[
            { id: "subscriptions", label: "订阅与代扣", icon: ReceiptText },
            { id: "wealth", label: "模拟理财", icon: Wallet },
            { id: "cards", label: "扩展卡服务", icon: CreditCard },
            { id: "workflow", label: "多步协作", icon: Network },
            { id: "life", label: "AA 与生活计划", icon: Clock3 },
            { id: "sandbox", label: "计算沙箱", icon: Braces },
          ].map((s) => (
            <button
              key={s.id}
              aria-label={s.label}
              aria-pressed={section === s.id}
              onClick={() => setSection(s.id)}
            >
              <s.icon size={17} />
              {s.label}
            </button>
          ))}
        </div>
      </section>}
      {section === "sandbox" && (
        <BankCodeSandbox
          busy={busy}
          balance={state.balance}
          loadStatus={loadSandboxStatus}
          onCompute={onSandboxCompute}
        />
      )}
      {section === "life" && (
        <BankAdvancedServices
          state={state}
          busy={busy}
          now={now}
          onPrepare={onPrepare}
        />
      )}
      {section === "subscriptions" && (
        <section className="ba-panel">
          <div className="ba-panel-heading">
            <h2>每月在续费什么？先核对清楚。</h2>
            <ReceiptText size={20} />
          </div>
          {!b.subscriptionsAuthorized ? (
            <div className="ba-service-empty">
              <ShieldCheck size={27} />
              <strong>查看订阅记录，也需要你的确认。</strong>
              <p>{b.subscriptionNotice}</p>
              <button
                className="ba-primary"
                disabled={busy}
                onClick={() => onPrepare({ type: "subscription_query" })}
              >
                准备查询订阅
                <ArrowRight size={15} />
              </button>
              <small>黄色权限 · 确认之前不展示订阅列表</small>
            </div>
          ) : (
            <div className="ba-subscription-list">
              {b.subscriptions.map((sub) => (
                <article className="ba-subscription" key={sub.id}>
                  <div>
                    <h3>{sub.merchant}</h3>
                    <span
                      className={`ba-pill ${sub.managed ? "green" : "yellow"}`}
                    >
                      {sub.managed ? "已知虚构授权" : "疑似订阅，未证实"}
                    </span>
                  </div>
                  <strong>
                    {money(sub.expectedCents)}
                    <small>/ 预计每期</small>
                  </strong>
                  <p>
                    {sub.expectedRenewalDate
                      ? `预计续费日 ${sub.expectedRenewalDate}，不是实际到账保证。`
                      : "会员已终止，没有预计续费日期。"}
                  </p>
                  <dl>
                    <div>
                      <dt>银行代扣授权</dt>
                      <dd>
                        {sub.bankMandateStatus === "ACTIVE"
                          ? "有效"
                          : sub.bankMandateStatus === "CANCELLED"
                            ? "已撤销"
                            : "未知"}
                      </dd>
                    </div>
                    <div>
                      <dt>商户会员</dt>
                      <dd>
                        {sub.merchantMembershipStatus === "ACTIVE"
                          ? "有效"
                          : sub.merchantMembershipStatus === "CANCELLED"
                            ? "已终止"
                            : "未知"}
                      </dd>
                    </div>
                  </dl>
                  <p className="ba-service-warning">{sub.warning}</p>
                  <details className="ba-evidence">
                    <summary>查看判断依据 · {sub.sampleCount} 条样本</summary>
                    <p>{sub.note}</p>
                    <p>
                      来源记录：
                      {sub.sourceRowIds.join("、") || "没有历史交易样本"}
                    </p>
                    {sub.possiblePriceChange && (
                      <p>样本金额发生变化，需要向商户核对原因。</p>
                    )}
                  </details>
                  {sub.managed && (
                    <div className="ba-service-actions">
                      <button
                        className="ba-secondary"
                        disabled={busy || sub.bankMandateStatus !== "ACTIVE"}
                        onClick={() =>
                          onPrepare({
                            type: "cancel_subscription",
                            subscriptionId: sub.id,
                            scope: "bank_mandate",
                          })
                        }
                      >
                        {sub.bankMandateStatus === "CANCELLED"
                          ? "代扣已撤销"
                          : "仅撤销银行代扣"}
                      </button>
                      <button
                        className="ba-secondary"
                        disabled={
                          busy || sub.merchantMembershipStatus !== "ACTIVE"
                        }
                        onClick={() =>
                          onPrepare({
                            type: "cancel_subscription",
                            subscriptionId: sub.id,
                            scope: "merchant_membership",
                          })
                        }
                      >
                        {sub.merchantMembershipStatus === "CANCELLED"
                          ? "会员已终止"
                          : "仅终止商户会员"}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {section === "wealth" && (
        <>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>先理解风险，再模拟决策。</h2>
              <Wallet size={20} />
            </div>
            <p className="ba-service-warning">{b.disclaimer}</p>
            <div className="ba-product-grid">
              {b.products.map((product) => (
                <article key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <span className="ba-pill yellow">
                      风险 {product.riskLevel}/3
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>起购</dt>
                      <dd>{money(product.minCents)}</dd>
                    </div>
                    <div>
                      <dt>锁定期</dt>
                      <dd>{product.lockDays} 天</dd>
                    </div>
                  </dl>
                  <p>{product.description}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>三个教学问题，由你自己回答。</h2>
              {b.riskProfile && (
                <span>已确认风险档 {b.riskProfile.riskLevel}/3</span>
              )}
            </div>
            <p className="ba-service-intro">
              不是正式适当性评估或投资建议。系统不会代选答案；确认前不会保存为已完成问卷。
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (answers.every((a) => a !== null))
                  onPrepare({ type: "risk_assessment", answers });
              }}
            >
              <div className="ba-risk-questions">
                {b.questionnaire.map((question, i) => (
                  <label key={question}>
                    <span>
                      {i + 1}. {question}
                    </span>
                    <select
                      aria-label={`教学风险问题${i + 1}`}
                      required
                      value={answers[i] ?? ""}
                      onChange={(e) =>
                        setAnswers((current) =>
                          current.map((a, j) =>
                            j === i ? Number(e.target.value) : a,
                          ),
                        )
                      }
                    >
                      <option value="" disabled>
                        请选择你的答案，不默认代选
                      </option>
                      <option value="0">
                        0 · {["不能接受损失", "随时需要使用", "不了解"][i]}
                      </option>
                      <option value="1">
                        1 · {["可接受少量损失", "至少7天后使用", "有所了解"][i]}
                      </option>
                      <option value="2">
                        2 ·{" "}
                        {["可接受较多损失", "至少30天后使用", "了解风险"][i]}
                      </option>
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="ba-primary"
                disabled={busy || answers.some((a) => a === null)}
                type="submit"
              >
                准备提交问卷
                <ArrowRight size={15} />
              </button>
            </form>
            {b.riskProfile && (
              <p className="ba-data-note">
                已确认答案 {b.riskProfile.answers.join(" / ")}；资金期限{" "}
                {b.riskProfile.horizonDays} 天。{b.riskProfile.disclaimer}
              </p>
            )}
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>准备一笔模拟申购</h2>
              <span>红色权限 · 需要额外验证</span>
            </div>
            <form
              className="ba-service-form"
              onSubmit={(e) => {
                e.preventDefault();
                onPrepare({ type: "wealth_buy", productId, amount });
              }}
            >
              <label>
                选择虚构产品
                <select
                  aria-label="申购产品"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {b.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · 风险{p.riskLevel}档
                    </option>
                  ))}
                </select>
              </label>
              <label>
                申购本金（人民币元）
                <input
                  aria-label="申购本金"
                  inputMode="decimal"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  placeholder="例如 100.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button
                className="ba-primary"
                disabled={busy || !b.riskProfile || !amount}
              >
                准备申购
                <ArrowRight size={15} />
              </button>
              {!b.riskProfile && (
                <small>先完成并确认上面的教学问卷，才可申请申购。</small>
              )}
            </form>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>我的模拟持仓</h2>
              <strong>{money(b.principalTotal)}</strong>
            </div>
            <p className="ba-service-intro">{b.returnsNote}</p>
            {b.positions.length ? (
              b.positions.map((position) => (
                <article key={position.id} className="ba-position">
                  <div>
                    <h3>{position.productName}</h3>
                    <strong>{money(position.principalCents)}</strong>
                  </div>
                  <code>{position.id}</code>
                  <p>
                    {position.principalCents === 0
                      ? "本金已全部赎回"
                      : position.unlockAt > now
                        ? `解锁时间 ${date(position.unlockAt)}，当前不可赎回`
                        : "已过锁定期，可准备赎回本金"}
                  </p>
                  {position.principalCents > 0 && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onPrepare({
                          type: "wealth_redeem",
                          positionId: position.id,
                          amount: redeem[position.id] || "",
                        });
                      }}
                    >
                      <label
                        className="ba-sr-only"
                        htmlFor={`redeem-${position.id}`}
                      >
                        赎回本金
                      </label>
                      <input
                        id={`redeem-${position.id}`}
                        aria-label={`赎回本金 ${position.id}`}
                        inputMode="decimal"
                        required
                        placeholder="赎回金额（元）"
                        value={redeem[position.id] || ""}
                        onChange={(e) =>
                          setRedeem((current) => ({
                            ...current,
                            [position.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        className="ba-secondary"
                        disabled={
                          busy ||
                          position.unlockAt > now ||
                          !redeem[position.id]
                        }
                      >
                        准备赎回
                      </button>
                    </form>
                  )}
                </article>
              ))
            ) : (
              <div className="ba-no-results">
                <Wallet size={25} />
                <p>还没有模拟持仓</p>
                <small>确认申购后，才会产生真实的本地持仓记录。</small>
              </div>
            )}
          </section>
        </>
      )}
      {section === "cards" && (
        <section className="ba-panel">
          <div className="ba-panel-heading">
            <h2>更多卡片操作，一样有边界。</h2>
            <CreditCard size={22} />
          </div>
          <button
            className="ba-secondary"
            disabled={busy}
            onClick={() => onPrepare({ type: "apply_virtual_card" })}
          >
            申请 DEMO 虚拟卡
            <ArrowRight size={15} />
          </button>
          <p className="ba-service-caption">
            黄色权限。只生成 DEMO 标识，没有真实卡号和支付能力。
          </p>
          <div className="ba-extended-cards">
            {state.cards.map((card) => {
              const controls = b.cardControls[card.id] || {
                online: true,
                overseas: true,
              };
              return (
                <article className="ba-extended-card" key={card.id}>
                  <div>
                    <h3>
                      {card.name} · {card.last4}
                    </h3>
                    <span
                      className={`ba-pill ${card.status === "ACTIVE" ? "green" : "yellow"}`}
                    >
                      {card.status === "ACTIVE"
                        ? "正常"
                        : card.status === "LOCKED"
                          ? "临时锁定"
                          : "已挂失冻结"}
                    </span>
                  </div>
                  {card.demoNumber && <code>{card.demoNumber} · 不能付款</code>}
                  <p>日消费限额 {money(card.limit)}，不是银行授信额度。</p>
                  <div className="ba-service-actions">
                    <button
                      className="ba-secondary"
                      disabled={busy || card.status === "FROZEN"}
                      onClick={() =>
                        onPrepare({
                          type:
                            card.status === "LOCKED"
                              ? "unlock_card"
                              : "temporary_lock_card",
                          cardLast4: card.last4,
                        })
                      }
                    >
                      {card.status === "LOCKED"
                        ? "解除临时锁定"
                        : "临时锁定卡片"}
                    </button>
                    <button
                      className="ba-secondary"
                      disabled={busy || card.status !== "ACTIVE"}
                      onClick={() =>
                        onPrepare({
                          type: "card_restriction",
                          cardLast4: card.last4,
                          channel: "online",
                          enabled: !controls.online,
                        })
                      }
                    >
                      {controls.online ? "限制线上新交易" : "允许线上新交易"}
                    </button>
                    <button
                      className="ba-secondary"
                      disabled={busy || card.status !== "ACTIVE"}
                      onClick={() =>
                        onPrepare({
                          type: "card_restriction",
                          cardLast4: card.last4,
                          channel: "overseas",
                          enabled: !controls.overseas,
                        })
                      }
                    >
                      {controls.overseas ? "限制境外新交易" : "允许境外新交易"}
                    </button>
                  </div>
                  <p className="ba-service-caption">
                    {card.status === "FROZEN"
                      ? "此卡已挂失，需要到卡片管理进行解挂，不能普通解锁。"
                      : "临时锁卡、渠道限制不等于取消商户会员或撤销代扣。"}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onPrepare({
                        type: "card_credit_request",
                        cardLast4: card.last4,
                        amount: creditAmounts[card.id] || "",
                      });
                    }}
                  >
                    <label className="ba-sr-only" htmlFor={`credit-${card.id}`}>
                      申请信用额度
                    </label>
                    <input
                      id={`credit-${card.id}`}
                      aria-label={`申请信用额度 ${card.last4}`}
                      inputMode="decimal"
                      placeholder="模拟申请额度（元）"
                      required
                      value={creditAmounts[card.id] || ""}
                      onChange={(e) =>
                        setCreditAmounts((current) => ({
                          ...current,
                          [card.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      className="ba-secondary"
                      disabled={
                        busy ||
                        card.status !== "ACTIVE" ||
                        !creditAmounts[card.id]
                      }
                    >
                      准备额度申请
                    </button>
                  </form>
                  <small>
                    仅记录待审核申请，不会直接授信、增加余额或改变消费限额。
                  </small>
                </article>
              );
            })}
          </div>
          <CardPaymentDemo state={state} busy={busy} onPrepare={onPrepare} />
          {!!b.creditApplications.length && (
            <div className="ba-credit-applications">
              <h3>已提交的模拟申请</h3>
              {b.creditApplications.map((a) => (
                <div key={a.id}>
                  <strong>
                    尾号 {a.cardLast4} · {money(a.requestedLimitCents)}
                  </strong>
                  <span>待审核 · 未授信</span>
                  <code>{a.id}</code>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {section === "workflow" && (
        <WorkflowPanel
          workflows={[...(state.workflows || [])].reverse()}
          busy={busy}
          onControl={onWorkflow}
          onDemo={onWorkflowDemo}
        />
      )}
    </>
  );
}
