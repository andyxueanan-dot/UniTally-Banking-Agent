import { useState } from "react";
import { Users, Clock3, Gift, ArrowRight, AlertTriangle } from "lucide-react";
import type { BankState } from "@/lib/bankApi";
import type { ManualAction } from "./BankServices";

const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    cents / 100,
  );
const date = (at: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
const iso = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+08:00` : value;
const amount = (cents: number) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

export default function BankAdvancedServices({
  state,
  busy,
  now,
  onPrepare,
}: {
  state: BankState;
  busy: boolean;
  now: number;
  onPrepare: (action: ManualAction) => void;
}) {
  const [tab, setTab] = useState("aa");
  const [aaAmount, setAaAmount] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [includeSelf, setIncludeSelf] = useState("");
  const [recipient, setRecipient] = useState("");
  const [scheduledAmount, setScheduledAmount] = useState("");
  const [executeAt, setExecuteAt] = useState("");
  const [budgetLabel, setBudgetLabel] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [productId, setProductId] = useState("");
  const [deliveryAt, setDeliveryAt] = useState("");
  const a = state.advanced;
  if (!a)
    return (
      <section className="ba-panel">
        <h2>生活计划需要更新后的后台</h2>
        <p className="ba-service-intro">
          请刷新状态；前端不会假装请求或订单已创建。
        </p>
      </section>
    );
  const statuses: Record<string, string> = {
    REQUESTED: "待模拟收款",
    PARTIALLY_SIMULATED_PAID: "部分模拟入账",
    SIMULATED_SETTLED: "模拟收齐",
    NO_COLLECTION_REQUIRED: "无需向他人收款",
    SCHEDULED: "未到期，仅提醒",
    DUE: "已到期，未付款",
    COMPLETED: "关联转账已完成",
    CANCELLED: "已取消",
    ACTIVE: "预留中",
    CONSUMED: "预算已用完",
    RELEASED: "已释放",
    PREPARED: "未付款草案",
    PAID: "已模拟支付",
    EXPIRED_UNPAID: "配送时间已过，未付款",
  };
  return (
    <>
      <section className="ba-panel">
        <div className="ba-panel-heading">
          <div>
            <span className="ba-section-kicker">
              LIFE, WITH A LITTLE LESS ADMIN
            </span>
            <h2>聚餐、约定与惊喜，有条不紊。</h2>
          </div>
          <Gift size={23} />
        </div>
        <p className="ba-service-intro">{a.warning}</p>
        <div
          className="ba-advanced-tabs"
          role="group"
          aria-label="生活计划分类"
        >
          {[
            { id: "aa", name: "AA 收款", icon: Users },
            { id: "schedule", name: "定时提醒", icon: Clock3 },
            { id: "budget", name: "生日预算", icon: Gift },
          ].map((t) => (
            <button
              key={t.id}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={17} />
              {t.name}
            </button>
          ))}
        </div>
      </section>
      {tab === "aa" && (
        <>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>先分清每个人，再发起请求。</h2>
              <Users size={21} />
            </div>
            <form
              className="ba-service-form"
              onSubmit={(e) => {
                e.preventDefault();
                onPrepare({
                  type: "aa_request",
                  amount: aaAmount,
                  participants,
                  includeSelf: includeSelf === "yes",
                });
              }}
            >
              <label>
                本次平摊总额（元）
                <input
                  aria-label="AA 总金额"
                  inputMode="decimal"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  placeholder="例如 240.00"
                  value={aaAmount}
                  onChange={(e) => setAaAmount(e.target.value)}
                />
              </label>
              <label>
                总额是否包含本人那份？
                <select
                  aria-label="AA 是否包含本人"
                  required
                  value={includeSelf}
                  onChange={(e) => setIncludeSelf(e.target.value)}
                >
                  <option value="" disabled>
                    请明确选择
                  </option>
                  <option value="yes">包含本人，本人也承担一份</option>
                  <option value="no">不包含本人，只向选中的他人平摊</option>
                </select>
              </label>
              <fieldset className="ba-participants">
                <legend>其他参与人（不重复勾选本人）</legend>
                {state.contacts.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={participants.includes(c.last4)}
                      onChange={(e) =>
                        setParticipants((current) =>
                          e.target.checked
                            ? [...current, c.last4]
                            : current.filter((t) => t !== c.last4),
                        )
                      }
                    />
                    <span>
                      {c.name}
                      <small>账户尾号 {c.last4}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                className="ba-primary"
                disabled={
                  busy ||
                  !aaAmount ||
                  !includeSelf ||
                  participants.length === 0 ||
                  (includeSelf === "no" && participants.length < 2)
                }
              >
                准备 AA 请求
                <ArrowRight size={15} />
              </button>
              <small>
                确认卡会逐人展示金额。总额按整数分拆分，无法均分的余分按显示顺序分配；创建请求不代表付款或收款。
              </small>
            </form>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>AA 请求与模拟进度</h2>
              <span>{a.requests.length} 项</span>
            </div>
            <p className="ba-service-warning">{a.simulationPoolNote}</p>
            {a.requests.length ? (
              a.requests.map((request) => (
                <article className="ba-aa-request" key={request.id}>
                  <div>
                    <strong>
                      {money(request.totalCents)} · {request.shares.length} 人
                    </strong>
                    <span className="ba-pill yellow">
                      {statuses[request.status] || request.status}
                    </span>
                  </div>
                  <code>{request.id}</code>
                  <p>
                    应收他人 {money(request.receivableCents)} · 已模拟入账{" "}
                    {money(request.collectedCents)}
                  </p>
                  {request.shares.map((share) => (
                    <div className="ba-aa-share" key={share.participantId}>
                      <div>
                        <strong>
                          {share.name}
                          {share.last4 ? ` · ${share.last4}` : ""}
                        </strong>
                        <small>
                          {share.isSelf
                            ? "本人承担，不发起收款"
                            : share.status === "SIMULATED_PAID"
                              ? "已由虚构清算池模拟入账"
                              : share.cents === 0
                                ? "无需付款"
                                : "未模拟付款，不代表真实欠款"}
                        </small>
                      </div>
                      <b>{money(share.cents)}</b>
                      {!share.isSelf &&
                        share.status === "REQUESTED" &&
                        share.cents > 0 && (
                          <button
                            className="ba-secondary"
                            disabled={busy}
                            onClick={() =>
                              onPrepare({
                                type: "simulate_aa_payment",
                                requestId: request.id,
                                participantId: share.participantId,
                                simulation: true,
                              })
                            }
                          >
                            模拟 {share.name} 付款
                          </button>
                        )}
                    </div>
                  ))}
                  <small>
                    只演示付款，不会向联系人发消息，也不读取其账户。
                  </small>
                </article>
              ))
            ) : (
              <div className="ba-no-results">
                <Users size={24} />
                <p>还没有 AA 请求</p>
                <small>先选清参与人和本人是否承担，再确认创建。</small>
              </div>
            )}
          </section>
        </>
      )}
      {tab === "schedule" && (
        <>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>把时间记下来，付款时再确认。</h2>
              <Clock3 size={21} />
            </div>
            <p className="ba-timezone">
              <Clock3 size={15} />
              所有输入与显示固定为 Asia/Shanghai（UTC+8），不随浏览器时区改变。
            </p>
            <form
              className="ba-service-form"
              onSubmit={(e) => {
                e.preventDefault();
                onPrepare({
                  type: "schedule_transfer",
                  recipient,
                  amount: scheduledAmount,
                  executeAt: iso(executeAt),
                });
              }}
            >
              <label>
                收款人
                <select
                  aria-label="定时提醒收款人"
                  required
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  <option value="" disabled>
                    请选择明确姓名与尾号
                  </option>
                  {state.contacts.map((c) => (
                    <option key={c.id} value={c.last4}>
                      {c.name} · {c.last4}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                计划转账金额（元）
                <input
                  aria-label="定时提醒金额"
                  inputMode="decimal"
                  required
                  placeholder="例如 200.00"
                  value={scheduledAmount}
                  onChange={(e) => setScheduledAmount(e.target.value)}
                />
              </label>
              <label>
                计划时间（UTC+8）
                <input
                  aria-label="计划转账时间 UTC+8"
                  type="datetime-local"
                  required
                  value={executeAt}
                  onChange={(e) => setExecuteAt(e.target.value)}
                />
              </label>
              <button
                className="ba-primary"
                disabled={busy || !recipient || !scheduledAmount || !executeAt}
              >
                准备定时提醒
                <ArrowRight size={15} />
              </button>
              <small>
                红色验证只授权保存提醒。到期不会自动扣款，也不预留资金，须再次核对余额与权限后确认转账。
              </small>
            </form>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>已记录的提醒</h2>
              <span>{a.schedules.length} 项</span>
            </div>
            {a.schedules.length ? (
              a.schedules.map((schedule) => {
                const status =
                  schedule.status === "SCHEDULED" && schedule.executeAt <= now
                    ? "DUE"
                    : schedule.status;
                return (
                  <article className="ba-schedule" key={schedule.id}>
                    <div>
                      <h3>
                        {schedule.recipientName} · {schedule.recipientLast4}
                      </h3>
                      <strong>{money(schedule.cents)}</strong>
                    </div>
                    <p>{date(schedule.executeAt)} · UTC+8</p>
                    <span className="ba-pill yellow">
                      {statuses[status] || status}
                    </span>
                    <code>{schedule.id}</code>
                    <p className="ba-service-caption">{schedule.note}</p>
                    <div className="ba-service-actions">
                      {status === "DUE" && (
                        <button
                          className="ba-primary"
                          disabled={busy}
                          onClick={() =>
                            onPrepare({
                              type: "transfer",
                              recipient: schedule.recipientLast4,
                              amount: amount(schedule.cents),
                              scheduleId: schedule.id,
                            })
                          }
                        >
                          到期后准备转账
                        </button>
                      )}
                      {schedule.status === "SCHEDULED" && (
                        <button
                          className="ba-secondary"
                          disabled={busy}
                          onClick={() =>
                            onPrepare({
                              type: "cancel_schedule",
                              scheduleId: schedule.id,
                            })
                          }
                        >
                          取消这项提醒
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="ba-no-results">
                <Clock3 size={24} />
                <p>还没有定时提醒</p>
                <small>计划不是付款指令，不会在后台自动执行。</small>
              </div>
            )}
          </section>
        </>
      )}
      {tab === "budget" && (
        <>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>先留预算，再逐笔安排惊喜。</h2>
              <Gift size={22} />
            </div>
            <p className="ba-service-warning">
              只用虚构用途和日期，不填写真实生日、地址或个人信息。鲜花与蛋糕都是虚构报价，不提供真实配送。
            </p>
            <p className="ba-timezone">
              <Clock3 size={15} />
              时间固定使用 Asia/Shanghai（UTC+8）。
            </p>
            <form
              className="ba-service-form"
              onSubmit={(e) => {
                e.preventDefault();
                onPrepare({
                  type: "reserve_budget",
                  label: budgetLabel,
                  amount: budgetAmount,
                  eventAt: iso(eventAt),
                });
              }}
            >
              <label>
                虚构用途
                <input
                  aria-label="预算虚构用途"
                  required
                  maxLength={80}
                  placeholder="例如：虚构生日惊喜"
                  value={budgetLabel}
                  onChange={(e) => setBudgetLabel(e.target.value)}
                />
              </label>
              <label>
                预留金额（元）
                <input
                  aria-label="预算预留金额"
                  inputMode="decimal"
                  required
                  placeholder="例如 1000.00"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
              </label>
              <label>
                虚构目标时间（UTC+8）
                <input
                  aria-label="预算目标时间 UTC+8"
                  type="datetime-local"
                  required
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                />
              </label>
              <button
                className="ba-primary"
                disabled={busy || !budgetLabel || !budgetAmount || !eventAt}
              >
                准备预留预算
                <ArrowRight size={15} />
              </button>
              <small>预留只减少可用余额，不减少账面余额，也不是付款。</small>
            </form>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>预算盒子</h2>
              <strong>{money(a.heldCents)} 已预留</strong>
            </div>
            {a.budgets.map((budget) => (
              <article className="ba-budget" key={budget.id}>
                <div>
                  <h3>{budget.label}</h3>
                  <span className="ba-pill green">
                    {statuses[budget.status] || budget.status}
                  </span>
                </div>
                <code>{budget.id}</code>
                <p>{date(budget.eventAt)} · UTC+8</p>
                <dl>
                  <div>
                    <dt>原预算</dt>
                    <dd>{money(budget.amountCents)}</dd>
                  </div>
                  <div>
                    <dt>仍预留</dt>
                    <dd>{money(budget.remainingCents)}</dd>
                  </div>
                  <div>
                    <dt>已模拟支付</dt>
                    <dd>{money(budget.spentCents)}</dd>
                  </div>
                  <div>
                    <dt>已释放</dt>
                    <dd>{money(budget.releasedCents)}</dd>
                  </div>
                </dl>
                {budget.status === "ACTIVE" && (
                  <button
                    className="ba-secondary"
                    disabled={busy}
                    onClick={() =>
                      onPrepare({ type: "release_budget", budgetId: budget.id })
                    }
                  >
                    释放剩余预算
                  </button>
                )}
                <p className="ba-service-caption">
                  释放会取消关联的未付款订单；已付款部分不会退款。
                </p>
              </article>
            ))}
            {!a.budgets.length && (
              <div className="ba-no-results">
                <Gift size={24} />
                <p>尚未预留预算</p>
              </div>
            )}
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>先准备订单，不自动下单。</h2>
              <span>明确的虚构报价</span>
            </div>
            <div className="ba-merchant-products">
              {a.merchantProducts.map((product) => (
                <div key={product.id}>
                  <Gift size={20} />
                  <strong>{product.name}</strong>
                  <b>{money(product.cents)}</b>
                  <small>{product.merchantName} · 无真实商户</small>
                </div>
              ))}
            </div>
            <form
              className="ba-service-form"
              onSubmit={(e) => {
                e.preventDefault();
                onPrepare({
                  type: "prepare_merchant_order",
                  budgetId,
                  productId,
                  deliveryAt: iso(deliveryAt),
                });
              }}
            >
              <label>
                使用哪份已预留预算？
                <select
                  aria-label="订单预算"
                  required
                  value={budgetId}
                  onChange={(e) => setBudgetId(e.target.value)}
                >
                  <option value="" disabled>
                    请选择当前有效预算
                  </option>
                  {a.budgets
                    .filter((b) => b.status === "ACTIVE")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} · 仍预留 {money(b.remainingCents)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                选择虚构商品
                <select
                  aria-label="订单商品"
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="" disabled>
                    请选择商品与报价
                  </option>
                  {a.merchantProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.cents)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                模拟配送时间（UTC+8）
                <input
                  aria-label="模拟配送时间 UTC+8"
                  type="datetime-local"
                  required
                  value={deliveryAt}
                  onChange={(e) => setDeliveryAt(e.target.value)}
                />
              </label>
              <button
                className="ba-primary"
                disabled={
                  busy ||
                  !budgetId ||
                  !productId ||
                  !deliveryAt ||
                  !a.budgets.some(
                    (b) => b.id === budgetId && b.status === "ACTIVE",
                  )
                }
              >
                准备未付款订单
                <ArrowRight size={15} />
              </button>
              <small>
                确认创建后仍未付款。之后的付款需要独立红色验证，未付订单也会占用预算分配。
              </small>
            </form>
          </section>
          <section className="ba-panel">
            <div className="ba-panel-heading">
              <h2>订单进度，只认实际状态。</h2>
              <span>{a.orders.length} 笔</span>
            </div>
            {a.orders.map((order) => {
              const status =
                order.status === "PREPARED" && order.deliveryAt <= now
                  ? "EXPIRED_UNPAID"
                  : order.status;
              return (
                <article className="ba-order" key={order.id}>
                  <div>
                    <h3>{order.productName}</h3>
                    <strong>{money(order.cents)}</strong>
                  </div>
                  <code>{order.id}</code>
                  <p>模拟配送 {date(order.deliveryAt)} · UTC+8</p>
                  <span
                    className={`ba-pill ${status === "PAID" ? "green" : "yellow"}`}
                  >
                    {statuses[status] || status}
                  </span>
                  {order.status === "PREPARED" && (
                    <div className="ba-service-actions">
                      <button
                        className="ba-primary"
                        disabled={busy || status === "EXPIRED_UNPAID"}
                        onClick={() =>
                          onPrepare({
                            type: "pay_merchant_order",
                            orderId: order.id,
                          })
                        }
                      >
                        准备模拟付款
                      </button>
                      <button
                        className="ba-secondary"
                        disabled={busy}
                        onClick={() =>
                          onPrepare({
                            type: "cancel_merchant_order",
                            orderId: order.id,
                          })
                        }
                      >
                        取消未付款订单
                      </button>
                    </div>
                  )}
                  <p className="ba-service-caption">
                    {status === "PAID"
                      ? "仅完成本地虚构清算，不代表真实商户已接单或已配送。"
                      : status === "EXPIRED_UNPAID"
                        ? "时间已过，不能付款；请取消后按新日期重新准备。"
                        : "没有连接真实商户或配送服务。"}
                  </p>
                </article>
              );
            })}
            {!a.orders.length && (
              <div className="ba-no-results">
                <AlertTriangle size={24} />
                <p>尚未创建订单</p>
                <small>预留预算并不代表已经购买鲜花或蛋糕。</small>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
