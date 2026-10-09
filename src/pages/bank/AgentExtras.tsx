import { useState } from "react";
import { ArrowDown, Check, Clock3, Headset, Pause, Play, RotateCcw, X } from "lucide-react";
import type { BankHandoff, BankResult, BankReversal, BankWorkflow } from "@/lib/bankApi";

// Pieces added for the competition requirements: a visible task graph (DAG) with interrupt / takeover /
// rollback, the human-takeover desk, and renderers for reports, life events and sandbox calculations.
const money = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(cents / 100);
const when = (at: number) => new Date(at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

const STEP: Record<string, string> = {
  balance: "查询余额", analyze: "分析账单", transactions: "查询交易", cards: "查询卡片", transfer: "转账",
  freeze_card: "挂失卡片", unfreeze_card: "解挂卡片", card_limit: "调整限额", temporary_lock_card: "临时锁卡", unlock_card: "解除锁卡",
  reserve_budget: "锁定预算", release_budget: "释放预算", prepare_merchant_order: "下单（未付款）", pay_merchant_order: "付款",
  cancel_merchant_order: "取消订单", request_reversal: "申请撤回", merchant_catalog: "查看报价",
};
const PRODUCT: Record<string, string> = { "flower-demo": "鲜花", "cake-demo": "蛋糕" };
const NODE_STATE: Record<string, string> = {
  PENDING: "等待上一步", WAITING_CONFIRMATION: "等你确认", WAITING_SETTLEMENT: "等待对账", SUCCEEDED: "已完成", FAILED: "未完成", CANCELLED: "已取消",
};
const FLOW_STATE: Record<string, string> = {
  READY: "可以继续", AWAITING_CONFIRMATION: "等你确认", WAITING_SETTLEMENT: "等待对账", SUCCEEDED: "全部完成", PAUSED: "已暂停",
  HANDOFF: "已转人工", CANCELLED: "已停止", NEEDS_ATTENTION: "需要处理",
};
const WRITE_TYPES = new Set(["transfer", "reserve_budget", "prepare_merchant_order", "pay_merchant_order", "freeze_card", "unfreeze_card", "temporary_lock_card"]);

function stepName(action: { type: string; [k: string]: unknown }) {
  const product = typeof action.productId === "string" ? PRODUCT[action.productId] : "";
  return `${STEP[action.type] || action.type}${product ? ` · ${product}` : ""}`;
}
// Group nodes by dependency depth so parallel branches sit side by side.
function layers(flow: BankWorkflow) {
  const depth = new Map<string, number>();
  const visit = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const n = flow.nodes.find(x => x.id === id)!;
    const d = n.dependsOn.length ? Math.max(...n.dependsOn.map(visit)) + 1 : 0;
    depth.set(id, d); return d;
  };
  flow.nodes.forEach(n => visit(n.id));
  const out: BankWorkflow["nodes"][] = [];
  for (const n of flow.nodes) (out[depth.get(n.id)!] ||= []).push(n);
  return out;
}

export function FlowList({ workflows, busy, onControl }: { workflows: BankWorkflow[]; busy: boolean; onControl: (id: string, action: string) => void }) {
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const shown = [...workflows].reverse().filter((f, i) => !["SUCCEEDED", "CANCELLED"].includes(f.status) || i < 3);
  if (!shown.length) return null;
  return (
    <section className="v3-flows" aria-label="多步骤任务">
      <h2>多步骤任务</h2>
      {shown.map(flow => {
        const done = flow.nodes.filter(n => n.status === "SUCCEEDED").length;
        const canRollback = !flow.compensatedBy && flow.kind !== "compensation" && flow.nodes.some(n => n.status === "SUCCEEDED" && WRITE_TYPES.has(n.action.type));
        const active = !["SUCCEEDED", "CANCELLED"].includes(flow.status);
        return (
          <article className={`v3-flow ${flow.kind || ""}`} key={flow.id} data-testid={`flow-${flow.id}`}>
            <header>
              <span>{flow.kind === "life_event" ? "跨场景计划" : flow.kind === "compensation" ? "回退流程" : "多步骤任务"}</span>
              <b>{FLOW_STATE[flow.status] || flow.status} · {done}/{flow.nodes.length}</b>
            </header>
            <p className="v3-flow-goal">{flow.goal}</p>
            <ol className="v3-graph">
              {layers(flow).map((layer, i) => (
                <li key={i}>
                  {i > 0 && <ArrowDown size={14} className="v3-graph-arrow" aria-hidden="true" />}
                  <div className={`v3-layer ${layer.length > 1 ? "parallel" : ""}`}>
                    {layer.map(n => (
                      <div key={n.id} className={`v3-node ${n.status.toLowerCase()}`}>
                        <span className="v3-node-mark">{n.status === "SUCCEEDED" ? <Check size={12} /> : n.status === "WAITING_CONFIRMATION" ? <Clock3 size={12} /> : null}</span>
                        <div>
                          <strong>{stepName(n.action)}</strong>
                          <small>{NODE_STATE[n.status] || n.status}{n.receiptId ? ` · ${n.receiptId}` : ""}</small>
                          {n.error && <small className="v3-node-error">{n.error}</small>}
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            {flow.handoff?.note && <p className="v3-flow-note">{flow.handoff.note}</p>}
            {flow.compensatedBy && flow.compensatedBy !== "NONE" && <p className="v3-flow-note">已生成回退流程，见上方。</p>}
            <div className="v3-flow-actions">
              {flow.status === "READY" && <button className="ba-primary" disabled={busy} onClick={() => onControl(flow.id, "advance")}><Play size={14} />准备下一步</button>}
              {["PAUSED", "HANDOFF", "NEEDS_ATTENTION"].includes(flow.status) && <button className="ba-primary" disabled={busy} onClick={() => onControl(flow.id, "resume")}><Play size={14} />继续</button>}
              {active && !["PAUSED", "HANDOFF"].includes(flow.status) && <button className="ba-secondary" disabled={busy} onClick={() => onControl(flow.id, "pause")}><Pause size={14} />暂停</button>}
              {active && flow.status !== "HANDOFF" && <button className="ba-secondary" disabled={busy} onClick={() => onControl(flow.id, "handoff")}><Headset size={14} />转人工</button>}
              {active && <button className="ba-link-button" disabled={busy || flow.nodes.some(n => n.status === "WAITING_SETTLEMENT")} onClick={() => onControl(flow.id, "cancel")}><X size={14} />停止剩余步骤</button>}
              {canRollback && confirmRollback !== flow.id && <button className="ba-link-button" disabled={busy} onClick={() => setConfirmRollback(flow.id)}><RotateCcw size={14} />回退已完成的步骤</button>}
            </div>
            {confirmRollback === flow.id && (
              <div className="v3-rollback-confirm">
                <p>会按相反顺序生成补偿任务：未付款订单取消、预算释放；已付款的部分只能申请撤回，需要对方或银行同意。每一步仍需你确认。</p>
                <button className="ba-primary" disabled={busy} onClick={() => { setConfirmRollback(null); onControl(flow.id, "rollback"); }}>生成回退任务</button>
                <button className="ba-link-button" onClick={() => setConfirmRollback(null)}>不回退</button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

const KIND: Record<string, string> = { workflow: "多步骤任务", task: "待确认操作", chat: "对话转人工", risk: "风控锁定", reversal: "撤回申请" };
const CASE_STATE: Record<string, string> = { OPEN: "待受理", CLAIMED: "处理中", RETURNED: "已交还用户", CLOSED: "已关闭" };

export function HandoffDesk({ handoffs, reversals, busy, onAction }: {
  handoffs: BankHandoff[]; reversals: BankReversal[]; busy: boolean;
  onAction: (caseId: string, action: string, body?: { note?: string; agent?: string }) => void;
}) {
  const [all, setAll] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = handoffs.filter(c => all || c.status === "OPEN" || c.status === "CLAIMED");
  return (
    <section className="v3-desk" aria-label="人工客服工作台">
      <h2>人工客服工作台</h2>
      <p className="v3-desk-note">演示：在同一浏览器里扮演客服。客服可以查看上下文、备注、受理撤回申请、解除风控锁定、把任务交还给用户；<b>不能替用户确认或验证任何付款</b>。</p>
      <div className="ba-task-filter" role="group" aria-label="工单筛选">
        <button aria-pressed={!all} onClick={() => setAll(false)}>待处理</button>
        <button aria-pressed={all} onClick={() => setAll(true)}>全部</button>
      </div>
      {!list.length && <p className="v2-empty">{all ? "还没有人工工单。" : "没有待处理的工单。"}</p>}
      <ol className="v3-cases">
        {list.map(c => {
          const reversal = c.kind === "reversal" ? reversals.find(r => r.id === c.sourceId) : undefined;
          const ctx = c.context as { goal?: string; title?: string; lastUserText?: string; nodes?: { type: string; status: string }[] };
          const note = notes[c.id] || "";
          return (
            <li key={c.id} className={`v3-case ${c.status.toLowerCase()}`} data-testid={`case-${c.id}`}>
              <header><span>{KIND[c.kind] || c.kind} · {c.id}</span><b>{CASE_STATE[c.status]}</b></header>
              <p className="v3-case-reason">{c.reason}</p>
              <dl>
                <dt>提交</dt><dd>{when(c.createdAt)}</dd>
                {c.agent && <><dt>受理人</dt><dd>{c.agent}</dd></>}
                {ctx.goal && <><dt>任务</dt><dd>{ctx.goal}</dd></>}
                {ctx.title && <><dt>操作</dt><dd>{ctx.title}</dd></>}
                {ctx.lastUserText && <><dt>用户原话</dt><dd>{ctx.lastUserText}</dd></>}
                {ctx.nodes && <><dt>进度</dt><dd>{ctx.nodes.filter(n => n.status === "SUCCEEDED").length}/{ctx.nodes.length} 步已完成</dd></>}
                {reversal && <><dt>撤回</dt><dd>{reversal.counterpartyName} {money(reversal.cents)}</dd></>}
              </dl>
              {!!c.notes.length && <ul className="v3-case-notes">{c.notes.map((n, i) => <li key={i}><small>{when(n.at)} · {n.by}</small>{n.text}</li>)}</ul>}
              {c.status === "OPEN" && <div className="v3-case-actions"><button className="ba-primary" disabled={busy} onClick={() => onAction(c.id, "claim", { agent: "演示客服" })}>受理</button></div>}
              {c.status === "CLAIMED" && (
                <>
                  <label className="v3-case-input"><span className="ba-sr-only">客服备注</span>
                    <input value={note} maxLength={300} placeholder="写一句处理说明（会给用户看到）" onChange={e => setNotes({ ...notes, [c.id]: e.target.value })} />
                  </label>
                  <div className="v3-case-actions">
                    {c.kind === "reversal" && <>
                      <button className="ba-primary" disabled={busy} onClick={() => onAction(c.id, "approve_reversal", { note })}>同意退回</button>
                      <button className="ba-secondary" disabled={busy} onClick={() => onAction(c.id, "reject_reversal", { note: note || "对方未同意" })}>驳回</button>
                    </>}
                    {c.kind === "risk" && <button className="ba-primary" disabled={busy} onClick={() => onAction(c.id, "unlock", { note })}>核实后解除锁定</button>}
                    {(c.kind === "workflow" || c.kind === "task") && <button className="ba-primary" disabled={busy} onClick={() => onAction(c.id, "return", { note })}>交还用户确认</button>}
                    <button className="ba-secondary" disabled={busy || !note.trim()} onClick={() => { onAction(c.id, "note", { note }); setNotes({ ...notes, [c.id]: "" }); }}>只记备注</button>
                    {c.kind !== "reversal" && <button className="ba-link-button" disabled={busy} onClick={() => onAction(c.id, "close", { note })}>关闭工单</button>}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ExtraResult({ result }: { result: BankResult }) {
  if (result.type === "report" && result.categories) {
    const max = Math.max(1, ...result.categories.map(c => c.cents));
    return (
      <div className="v3-report">
        <div className="v3-report-head">
          <span>{result.period} {result.yearly ? "年度" : "月度"}账单报告</span>
          <strong>{money(result.total || 0)}</strong>
          <small>{result.count} 笔消费 · {result.activeDays} 天有消费{result.previousTotal ? ` · 上期 ${money(result.previousTotal)}` : ""}</small>
        </div>
        <ul className="v3-report-bars">
          {result.categories.map(c => (
            <li key={c.name}><span>{c.name}</span><i style={{ width: `${(c.cents / max) * 100}%` }} /><b>{money(c.cents)}</b><small>{c.share}%</small></li>
          ))}
        </ul>
        {!!result.topMerchants?.length && (
          <dl className="v3-report-merchants">
            {result.topMerchants.map(m => <div key={m.name}><dt>{m.name}<small> · {m.count} 笔</small></dt><dd>{money(m.cents)}</dd></div>)}
          </dl>
        )}
        <div className="v3-report-flows"><span>转出 {money(result.transfersOut || 0)}</span><span>退回 / 到账 {money(result.inflow || 0)}</span><span>订阅 {money(result.subscriptions || 0)}</span></div>
        {!!result.highlights?.length && <ul className="v3-report-highlights">{result.highlights.map(h => <li key={h}>{h}</li>)}</ul>}
        {!!result.alerts?.length && <ul className="v3-alerts">{result.alerts.map(a => <li key={a.id}><b>{a.kind === "large_new_merchant" ? "新商户大额" : "同类异常"}</b>{a.merchant} {money(a.cents)} · {a.date}<small>{a.assessment}</small></li>)}</ul>}
      </div>
    );
  }
  if (result.type === "life_events" && result.events) {
    return <ul className="v3-events">{result.events.map(e => <li key={e.id}><strong>{e.label}</strong><span>{e.date}</span><small>还有 {e.daysLeft} 天</small></li>)}</ul>;
  }
  if (result.type === "sandbox_calc") {
    return (
      <details className="v3-sandbox">
        <summary>{result.ok ? "在隔离沙箱中运行的代码" : "沙箱未完成计算"}</summary>
        <dl>
          <dt>模型写的计算式</dt><dd><code>{result.expression}</code></dd>
          {result.wat && <><dt>编译后的 WebAssembly（无导入、无内存、无文件和网络）</dt><dd><pre>{result.wat}</pre></dd></>}
          {result.codeHash && <><dt>代码 SHA-256</dt><dd><code>{result.codeHash.slice(0, 16)}…</code></dd></>}
          {result.metrics && <><dt>运行限制</dt><dd>耗时 {result.metrics.elapsedMs ?? "—"} ms · 指令预算 {result.metrics.fuelLimit ?? "—"}{result.metrics.fuelConsumed != null ? `（用掉 ${result.metrics.fuelConsumed}）` : ""}</dd></>}
        </dl>
        <p>结果只作参考，不会写入账本，也不能用来决定权限。</p>
      </details>
    );
  }
  return null;
}
