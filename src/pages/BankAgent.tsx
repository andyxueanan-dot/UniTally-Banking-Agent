import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Wallet,
  X,
  CheckCircle2,
  Clock3,
  Landmark,
  ReceiptText,
  Download,
  CircleDot,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  History,
  Grid2X2,
  MessageSquareText,
  UserRound,
  ChevronLeft,
} from "lucide-react";
import {
  bankRequest,
  BankApiError,
  storedBankToken,
  saveBankToken,
  type BankState,
  type BankHealth,
  type BankTask,
  type BankResponse,
  type BankResult,
  type BankTransaction,
  type BankSandboxStatus,
  type BankSandboxResponse,
} from "@/lib/bankApi";
import "./bank-agent.css";
import BankServices, { type ManualAction } from "./bank/BankServices";
import PasskeyPanel from "./bank/PasskeyPanel";
import { passkeyLocalUrl } from "@/lib/bankApi";
import { connectionDetails } from '@/lib/bankConnection';
import MobileTransferSheet from '@/mobile/MobileTransferSheet';
import MobileHome from '@/mobile/MobileHome';
import PlannerFeedback from './bank/PlannerFeedback';

const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    cents / 100,
  );
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const timestamp = (at: number) =>
  new Date(at).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const leftTime = (expires: number, now: number) => {
  const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
const statuses: Record<string, string> = {
  AWAITING_CONFIRMATION: "等待确认",
  SUCCEEDED: "已完成",
  PENDING_REVIEW: "待对账",
  CANCELLED: "已取消",
  SUPERSEDED: "已被新任务取代",
  EXPIRED: "已过期",
};
const MODE_KEY = "unitally.bank.demo.mode.v1";
const taskStatus = (task: BankTask, now: number) =>
  task.status === "AWAITING_CONFIRMATION" && task.expiresAt <= now
    ? "EXPIRED"
    : task.status;
const colors = [
  "#eb8b53",
  "#334f47",
  "#bcad8c",
  "#798a9d",
  "#d6cbc1",
  "#aa7d64",
];
const cardStatusLabel = (status: string) =>
  ({ ACTIVE: "正常使用", LOCKED: "临时锁定", FROZEN: "已挂失冻结" })[status] ||
  status;
const isIncoming = (type: string) =>
  ["investment_redeem", "aa_receipt"].includes(type);
const suggestions = [
  {
    id: "analysis",
    title: "我的钱花在哪了？",
    short: "分析账单",
    text: "分析这个月的消费，和上个月比一比，有没有需要核对的账单？",
    icon: FileText,
  },
  {
    id: "transfer",
    title: "给小王转 200 元",
    short: "转一笔钱",
    text: "给小王转 200 元",
    icon: ArrowUpRight,
  },
  {
    id: "freeze",
    title: "找不到我的消费卡了",
    short: "挂失卡片",
    text: "帮我挂失冻结尾号 8806 的卡",
    icon: ShieldCheck,
  },
];
type TaskAction = (
  task: BankTask,
  action: string,
  body?: object,
) => Promise<{ demoCode?: string; expiresAt?: number } | undefined>;

function TaskCard({
  task,
  busy,
  now,
  onAction,
  auth,
  compact = false,
}: {
  task: BankTask;
  busy: boolean;
  now: number;
  onAction: TaskAction;
  auth?: BankState["auth"];
  compact?: boolean;
}) {
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [codeExpires, setCodeExpires] = useState(0);
  const [ack, setAck] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const status = taskStatus(task, now);
  const waiting = status === "AWAITING_CONFIRMATION";
  const done = status === "SUCCEEDED";
  const stopped = ["CANCELLED", "SUPERSEDED", "EXPIRED"].includes(status);
  const deviceRequired = task.risk === "red" && auth?.mode === "passkey";
  const deviceOriginValid =
    !deviceRequired || window.location.origin === auth?.origin;
  const effectiveSteps = task.steps.map((step, i) =>
    stopped && i > 1
      ? {
          ...step,
          state: "stopped",
          label: i === 2 ? statuses[status] : "未执行，不会扣款",
        }
      : step,
  );
  return (
    <article
      className={`ba-task ${done ? "ba-task-done" : ""} ${stopped ? "ba-task-stopped" : ""}`}
      data-testid={`task-${task.id}`}
    >
      <div className="ba-task-top">
        <span
          className={`ba-pill ${done ? "green" : stopped ? "neutral" : task.risk}`}
        >
          <span className="ba-dot" />
          {done
            ? task.result?.type === "card_credit_request"
              ? "模拟申请已提交 · 未授信"
              : "模拟业务完成"
            : stopped
              ? statuses[status]
              : task.risk === "red"
                ? deviceRequired
                  ? "红色 · 设备签名验证"
                  : "红色 · 演示强验证"
                : "黄色 · 用户确认"}
        </span>
        <span className="ba-task-status">
          {stopped ? "未执行" : statuses[status]}
        </span>
      </div>
      <h3>{task.title}</h3>
      {waiting && (
        <div className="ba-task-facts">
          {task.action.shares?.map((share) => (
            <div key={share.participantId}>
              <span>
                {share.name}
                {share.last4 ? ` · ${share.last4}` : "（本人承担）"}
              </span>
              <strong>{money(share.cents)}</strong>
            </div>
          ))}
          {(task.action.recipientLast4 || task.action.cardLast4) && (
            <div>
              <span>
                {task.action.type === "transfer" ? "收款账户" : "操作卡片"}
              </span>
              <strong>
                {task.action.recipientName || "演示卡片"} · 尾号{" "}
                {task.action.recipientLast4 || task.action.cardLast4}
              </strong>
            </div>
          )}
          {task.action.cents !== undefined && (
            <div>
              <span>
                {task.action.type === "transfer"
                  ? "转账金额"
                  : task.action.type === "card_limit"
                    ? "新消费限额"
                    : "操作金额"}
              </span>
              <strong>{money(task.action.cents)}</strong>
            </div>
          )}
          {task.action.reserveCents !== undefined && (
            <div>
              <span>转账后至少保留</span>
              <strong>{money(task.action.reserveCents)}</strong>
            </div>
          )}
          <div>
            <span>授权剩余有效时间</span>
            <strong className="ba-countdown">
              <Clock3 size={13} />
              {leftTime(task.expiresAt, now)}
            </strong>
          </div>
        </div>
      )}
      {(waiting || status === "PENDING_REVIEW" || expanded) && (
        <div className="ba-steps">
          {effectiveSteps.map((step, i) => (
            <div key={`${i}-${step.label}`} className={`ba-step ${step.state}`}>
              <span>
                {step.state === "done" ? (
                  <Check size={11} />
                ) : step.state === "stopped" ? (
                  <X size={11} />
                ) : (
                  i + 1
                )}
              </span>
              <small>{step.label}</small>
            </div>
          ))}
        </div>
      )}
      {waiting && (
        <>
          <div className="ba-confirm-detail">
            <LockKeyhole size={15} />
            <span>确认只对上述具体操作生效。需求变更后，需要重新授权。</span>
          </div>
          {task.risk === "red" && !deviceRequired && (
            <div className="ba-verification">
              <p>
                <ShieldAlert size={16} />
                页面内模拟验证，不是真实短信或人脸认证
              </p>
              <button
                type="button"
                className="ba-link-button"
                disabled={busy}
                onClick={async () => {
                  const result = await onAction(task, "challenge");
                  if (result?.demoCode) {
                    setDemoCode(result.demoCode);
                    setCode("");
                    setCodeExpires(result.expiresAt || now + 120000);
                  }
                }}
              >
                获取演示验证码
              </button>
              {demoCode && (
                <p className="ba-demo-code">
                  演示码：<strong data-testid="demo-code">{demoCode}</strong>
                  <small>
                    {codeExpires > now
                      ? `剩余 ${leftTime(codeExpires, now)}，仅用于此任务`
                      : "验证码已过期，请重新获取"}
                  </small>
                </p>
              )}
              <label className="ba-sr-only" htmlFor={`code-${task.id}`}>
                输入六位演示验证码
              </label>
              <input
                id={`code-${task.id}`}
                aria-label="输入六位演示验证码"
                inputMode="numeric"
                autoComplete="off"
                placeholder="输入 6 位演示验证码"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          {deviceRequired && (
            <div className="ba-device-task">
              <ShieldCheck size={18} />
              <p>
                请先核对上述详情并勾选确认，再使用已绑定设备签名。签名由后台绑定到本次任务；系统弹窗不保证展示交易金额与对象。
              </p>
              {!deviceOriginValid && (
                <p>
                  请返回原 localhost 页面完成设备验证。
                  {passkeyLocalUrl(auth?.origin) && (
                    <a href={passkeyLocalUrl(auth?.origin)!}>
                      打开固定入口（不会迁移会话）
                    </a>
                  )}
                </p>
              )}
            </div>
          )}
          <label className="ba-ack">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            我已核对以上操作详情，仅在沙箱中执行
          </label>
          <div className="ba-task-buttons">
            <button
              className="ba-primary"
              disabled={
                busy ||
                !ack ||
                !deviceOriginValid ||
                (task.risk === "red" &&
                  !deviceRequired &&
                  (code.length !== 6 || !codeExpires || codeExpires <= now))
              }
              onClick={() =>
                onAction(task, deviceRequired ? "device-confirm" : "confirm", {
                  confirmed: true,
                  code,
                })
              }
            >
              <CheckCheck size={16} />
              {deviceRequired ? "设备验证并执行" : "确认执行"}
            </button>
            <button
              className="ba-secondary"
              disabled={busy}
              onClick={() => onAction(task, "cancel")}
            >
              取消任务
            </button>
          </div>
        </>
      )}
      {status === "PENDING_REVIEW" && (
        <div className="ba-pending">
          <Clock3 size={18} />
          <p>
            模拟接口超时，结果待核对。金额已预留，未生成成功回执。请勿重复发起。
          </p>
          <button
            className="ba-secondary"
            disabled={busy}
            onClick={() => onAction(task, "reconcile")}
          >
            模拟后台对账
          </button>
        </div>
      )}
      {stopped && (
        <p className="ba-terminal-note">
          {status === "EXPIRED"
            ? "授权已过期，操作未执行。如仍需办理，请重新提出需求。"
            : status === "SUPERSEDED"
              ? "已被新的需求替代。旧确认不能继续执行，也没有扣款。"
              : "你已取消这项操作，没有资金或卡片状态变动。"}
        </p>
      )}
      {task.receipt && (
        <div className="ba-receipt" role="status">
          <CheckCircle2 size={19} />
          <div>
            <strong>回执已记录 · {clock(task.receipt.at)}</strong>
            <code>{task.receipt.id}</code>
            <small>
              账户余额 {money(task.receipt.balanceAfter)} · 仅模拟资金
            </small>
          </div>
        </div>
      )}
      {task.result?.text && (
        <div className="ba-execution-result">
          <strong>后台实际结果</strong>
          <p>{task.result.text}</p>
          {task.result.position && <code>持仓 {task.result.position.id}</code>}
          {task.result.card?.demoNumber && (
            <code>{task.result.card.demoNumber}</code>
          )}
          {task.result.application && (
            <code>{task.result.application.id} · 待审核，未授信</code>
          )}
        </div>
      )}
      {!waiting && status !== "PENDING_REVIEW" && (
        <button
          className="ba-link-button ba-task-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "收起处理步骤" : "查看处理步骤"}
          <ChevronDown size={14} />
        </button>
      )}
    </article>
  );
}

function SourceRows({ rows }: { rows: BankTransaction[] }) {
  return (
    <div className="ba-source-rows">
      {rows.map((row) => (
        <div key={row.id}>
          <div>
            <strong>{row.merchant}</strong>
            <span>{money(row.cents)}</span>
          </div>
          <small>
            {row.date} · {row.category} · {row.id}
          </small>
          <small>{row.source || "本地虚构账单"}</small>
        </div>
      ))}
    </div>
  );
}
function AnalysisResult({ result }: { result: BankResult }) {
  if (result.type === "transactions" && result.rows)
    return (
      <details className="ba-evidence">
        <summary>
          查看查询结果 · {result.rows.length} 笔<ChevronDown size={14} />
        </summary>
        <SourceRows rows={result.rows} />
      </details>
    );
  if (result.type !== "analysis" || !result.categories) return null;
  const groups =
    result.anomalies ||
    (result.anomalyIds || []).map((id) => {
      const row = result.rows?.find((r) => r.id === id);
      return {
        id,
        merchant: row?.merchant || "待核对记录",
        assessment:
          "同日、同商户、同金额，只是需要核对的候选，不能据此确认重复扣款。",
        rows: row
          ? result.rows?.filter(
              (r) =>
                r.date === row.date &&
                r.merchant === row.merchant &&
                r.cents === row.cents,
            ) || []
          : [],
      };
    });
  return (
    <div className="ba-analysis-result">
      <div className="ba-stacked-bar" aria-hidden="true">
        {result.categories.map((c, i) => (
          <span
            key={c.name}
            style={{
              width: `${result.total ? (c.cents / result.total) * 100 : 0}%`,
              background: colors[i % colors.length],
            }}
          />
        ))}
      </div>
      <div className="ba-category-list">
        {result.categories.map((c, i) => (
          <div key={c.name}>
            <span>
              <i style={{ background: colors[i % colors.length] }} />
              {c.name}
            </span>
            <strong>{money(c.cents)}</strong>
          </div>
        ))}
      </div>
      {!!result.drivers?.length && (
        <div className="ba-drivers">
          <strong>变化主要来自哪里？</strong>
          {result.drivers
            .filter((d) => d.deltaCents !== 0)
            .slice(0, 3)
            .map((d) => (
              <div key={d.name}>
                <span>
                  {d.name}
                  <small>
                    上月 {money(d.previousCents)} → 本月 {money(d.currentCents)}
                  </small>
                </span>
                <b>
                  {d.deltaCents > 0 ? "+" : "−"}
                  {money(Math.abs(d.deltaCents))}
                </b>
              </div>
            ))}
        </div>
      )}
      {groups.map((group) => (
        <details className="ba-evidence ba-anomaly" key={group.id}>
          <summary>
            <AlertTriangle size={15} />
            <span>{group.merchant} · 查看待核对记录</span>
            <ChevronDown size={14} />
          </summary>
          <p>{group.assessment}</p>
          <SourceRows rows={group.rows} />
        </details>
      ))}
      <details className="ba-evidence">
        <summary>
          查看计算依据 · {result.rows?.length || 0} 条虚构消费记录
          <ChevronDown size={14} />
        </summary>
        <SourceRows rows={result.rows || []} />
      </details>
      <small>金额由后台计算 · 转账不计入消费 · 非真实银行数据</small>
    </div>
  );
}
function TransactionList({
  rows,
  detailed = false,
}: {
  rows: BankTransaction[];
  detailed?: boolean;
}) {
  return (
    <div className="ba-transactions">
      {rows.length ? (
        rows.map((t) => (
          <div className="ba-transaction" key={t.id}>
            <span
              className={`ba-merchant-icon ${t.type === "transfer" ? "amber" : ""}`}
            >
              {t.type === "transfer" ? (
                <ArrowUpRight size={18} />
              ) : (
                <ReceiptText size={18} />
              )}
            </span>
            <div>
              <strong>{t.merchant}</strong>
              <small>
                {t.date} · {t.category}
                {t.type === "investment_redeem"
                  ? " · 本金赎回"
                  : t.type === "investment_buy"
                    ? " · 本金申购"
                    : ""}
              </small>
              {detailed && <code>{t.id}</code>}
            </div>
            <span className={isIncoming(t.type) ? "ba-incoming" : ""}>
              {isIncoming(t.type) ? "+" : "−"}
              {money(t.cents)}
            </span>
          </div>
        ))
      ) : (
        <div className="ba-no-results">
          <Search size={24} />
          <p>没有符合条件的账单</p>
          <small>试试其他关键词，或清除筛选。</small>
        </div>
      )}
    </div>
  );
}

export default function BankAgent({ mobile = false }: { mobile?: boolean }) {
  const connection = connectionDetails();
  const mobileHistory = useRef<string[]>([]);
  const currentTab = useRef('overview');
  const [state, setState] = useState<BankState | null>(null);
  const [health, setHealth] = useState<BankHealth | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [transferOpen, setTransferOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "offline">(() =>
    localStorage.getItem(MODE_KEY) === "offline" ? "offline" : "ai",
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"reset" | "guide" | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const serverOffset = useRef(0);
  const chatBody = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const applyState = useCallback((next: BankState) => {
    if (next.serverNow) serverOffset.current = next.serverNow - Date.now();
    setNow(Date.now() + serverOffset.current);
    setState(next);
  }, []);
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof BankApiError && e.state) applyState(e.state);
      setError(e instanceof Error ? e.message : "操作未完成，请刷新状态。");
    },
    [applyState],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const meta = await bankRequest<BankHealth>("/health");
      setHealth(meta);
      if (!meta.aiConfigured) setMode("offline");
      let activeToken = storedBankToken();
      let current: BankState;
      if (activeToken) {
        try {
          current = await bankRequest<BankState>("/state", activeToken);
        } catch (e) {
          if (e instanceof BankApiError && e.code === "SESSION_REQUIRED")
            activeToken = null;
          else throw e;
        }
      }
      if (!activeToken) {
        const created = await bankRequest<{ token: string; state: BankState }>(
          "/sessions",
          null,
          {},
        );
        activeToken = created.token;
        current = created.state;
        saveBankToken(activeToken);
      }
      setToken(activeToken);
      applyState(current!);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [applyState, handleError]);
  useEffect(() => {
    document.title = "FinPilot · 银行智能体工作台";
    document.documentElement.lang = "zh-CN";
    void load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now() + serverOffset.current),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);
  useEffect(() => {
    if (chatBody.current)
      chatBody.current.scrollTop = chatBody.current.scrollHeight;
  }, [state?.history.length, busy, tab]);
  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const refresh = async () => {
    if (!token) return;
    setBusy(true);
    try {
      applyState(await bankRequest<BankState>("/state", token));
      setHealth(await bankRequest<BankHealth>("/health"));
      setError("");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const send = async (text: string, demo?: string, simulateTimeout = false) => {
    if (!token || busy || !text.trim()) return;
    if (mode === "offline" && !demo) {
      setError(
        "离线模式只运行明确的固定案例，不会理解自由输入。自由对话需要已配置的 AI 模型。",
      );
      return;
    }
    setBusy(true);
    setError("");
    setInput("");
    try {
      const result = await bankRequest<BankResponse>("/chat", token, {
        text,
        ...(mode === "offline" ? { demo } : {}),
        simulateTimeout,
      });
      applyState(result.state);
      setHealth(await bankRequest<BankHealth>("/health"));
      if (mobile && result.message?.results?.some(r => r.type === 'proposal')) { setTaskFilter('active'); go('audit'); }
      return result.message?.results?.some(r => r.type === 'proposal');
    } catch (e) {
      handleError(e);
      if (mode === "ai") setInput(text);
    } finally {
      setBusy(false);
    }
  };
  const act: TaskAction = async (task, action, body = {}) => {
    setBusy(true);
    setError("");
    try {
      if (action === "device-confirm") {
        const options = await bankRequest<{
          options: PublicKeyCredentialRequestOptionsJSON;
          state: BankState;
        }>(`/tasks/${task.id}/passkey/options`, token, {});
        applyState(options.state);
        let response;
        try {
          response = await startAuthentication({
            optionsJSON: options.options,
          });
        } catch {
          throw new BankApiError(
            "DEVICE_NOT_COMPLETED",
            "设备验证未完成或被取消，没有发送执行确认。可重新尝试设备验证；不会降级使用演示验证码。",
          );
        }
        const result = await bankRequest<BankResponse>(
          `/tasks/${task.id}/passkey/confirm`,
          token,
          { response, confirmed: true },
        );
        applyState(result.state);
        if (mobile && result.task?.status === 'SUCCEEDED') setTaskFilter('done');
        return;
      }
      const result = await bankRequest<
        BankResponse & { demoCode?: string; expiresAt?: number }
      >(`/tasks/${task.id}/${action}`, token, body);
      if (result.state) applyState(result.state);
      else if (token) applyState(await bankRequest<BankState>("/state", token));
      if (mobile && result.task?.status === 'SUCCEEDED') setTaskFilter('done');
      return result;
    } catch (e) {
      handleError(e);
      if (!(e instanceof BankApiError && e.state) && token) {
        try {
          applyState(await bankRequest<BankState>("/state", token));
        } catch {
          /* Preserve the original error. */
        }
      }
    } finally {
      setBusy(false);
    }
  };
  const registerDevice = async () => {
    if (
      !token ||
      busy ||
      !state?.auth?.canRegister ||
      state.auth.mode === "passkey"
    )
      return;
    setBusy(true);
    setError("");
    try {
      const options = await bankRequest<{
        options: PublicKeyCredentialCreationOptionsJSON;
        state: BankState;
      }>("/passkey/register/options", token, {});
      applyState(options.state);
      let response;
      try {
        response = await startRegistration({ optionsJSON: options.options });
      } catch {
        throw new BankApiError(
          "DEVICE_REGISTRATION_NOT_COMPLETED",
          "设备注册未完成或被取消，尚未绑定设备。没有执行任何银行业务。",
        );
      }
      const result = await bankRequest<BankResponse & { registered: boolean }>(
        "/passkey/register/verify",
        token,
        { response },
      );
      applyState(result.state);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const prepareManual = async (action: ManualAction) => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await bankRequest<BankResponse>("/prepare", token, {
        action,
      });
      applyState(result.state);
      const blocked = result.message?.results?.find(r => r.type === 'blocked' || r.type === 'clarify');
      if (blocked) setError(blocked.text);
      window.setTimeout(
        () =>
          document
            .getElementById("bank-active-tasks")
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
        50,
      );
      if (mobile && result.message?.results?.some(r => r.type === 'proposal')) { setTaskFilter('active'); go('audit'); }
      return result.message?.results?.some(r => r.type === 'proposal');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const saveFeedback = async (messageId: string, correction: string) => {
    if (!token || busy) return false;
    setBusy(true); setError('');
    try { const result = await bankRequest<{ state: BankState }>('/feedback', token, { messageId, correction }); applyState(result.state); return true; }
    catch (e) { handleError(e); return false; }
    finally { setBusy(false); }
  };
  const exportFeedback = async () => {
    if (!token || busy) return;
    setBusy(true); setError('');
    try { const value = await bankRequest('/feedback', token); const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'planner-feedback-unreviewed.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (e) { handleError(e); }
    finally { setBusy(false); }
  };
  const controlWorkflow = async (id: string, action: string) => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await bankRequest<BankResponse>(
        `/workflows/${id}/${action}`,
        token,
        {},
      );
      applyState(result.state);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const demoWorkflow = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await bankRequest<BankResponse>("/chat", token, {
        text: "固定案例：查询余额，给王明转200元，再查询卡片。",
        demo: "workflow",
      });
      applyState(result.state);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const loadSandboxStatus = useCallback(async () => {
    if (!token) throw new Error("演示会话尚未就绪");
    return bankRequest<BankSandboxStatus>("/sandbox/status", token);
  }, [token]);
  const computeSandbox = async (wat: string, inputs: [string, string]) => {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await bankRequest<BankSandboxResponse>(
        "/sandbox/compute",
        token,
        { wat, inputs },
      );
      applyState(result.state);
      return result;
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const fresh = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await bankRequest<{ token: string; state: BankState }>(
        "/sessions",
        null,
        {},
      );
      saveBankToken(next.token);
      setToken(next.token);
      applyState(next.state);
      setModal(null);
      setInput("");
      setSearch("");
      setFilter("all");
      setPeriod("all");
      setTab("overview");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };
  const openModal = (value: "reset" | "guide", target: HTMLElement) => {
    opener.current = target;
    setModal(value);
  };
  const exportAudit = () => {
    if (!state) return;
    const data = {
      sandbox: true,
      exportedAt: new Date().toISOString(),
      note: "虚构银行数据；无密钥、会话令牌或真实账户；非生产认证",
      tasks: state.tasks,
      business: state.business,
      advanced: state.advanced,
      workflows: state.workflows,
      ledger: state.ledger,
      audit: state.audit,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "finpilot-bank-demo-audit.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const expenses = useMemo(
    () =>
      state?.transactions.filter(
        (t) => t.type === "expense" && t.date.startsWith(state.referenceMonth),
      ) || [],
    [state],
  );
  const total = expenses.reduce((sum, t) => sum + t.cents, 0);
  const categories = Object.entries(
    expenses.reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.cents;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  let angle = 0;
  const ring = categories
    .map(([, value], i) => {
      const start = angle;
      angle += total ? (value / total) * 360 : 0;
      return `${colors[i % colors.length]} ${start}deg ${angle}deg`;
    })
    .join(",");
  const tasks = state?.tasks || [];
  const pending = tasks.filter((t) =>
    ["AWAITING_CONFIRMATION", "PENDING_REVIEW"].includes(taskStatus(t, now)),
  );
  const recentFinished = tasks
    .filter(
      (t) =>
        !["AWAITING_CONFIRMATION", "PENDING_REVIEW"].includes(
          taskStatus(t, now),
        ),
    )
    .slice(0, 1);
  const rows = (state?.transactions || [])
    .filter(
      (t) =>
        (filter === "all" || t.type === filter) &&
        (period === "all" || t.date.startsWith(period)) &&
        `${t.merchant} ${t.category} ${t.id} ${t.date}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const periods = [
    ...new Set((state?.transactions || []).map((t) => t.date.slice(0, 7))),
  ]
    .sort()
    .reverse();
  const navItems = [
    { id: "overview", title: "工作台", icon: LayoutDashboard },
    { id: "bills", title: "账单明细", icon: ReceiptText },
    { id: "cards", title: "卡片管理", icon: CreditCard },
    { id: "services", title: "服务中心", icon: Grid2X2 },
    { id: "audit", title: "操作记录", icon: ShieldCheck },
  ];
  const titles: Record<string, string> = {
    overview: "钱的事，一句话就好。",
    bills: "看清每一笔，心里才有底。",
    cards: "卡片的控制权，始终在你。",
    services: "金融琐事，一站办得明白。",
    audit: "每个决定，都有迹可循。",
    assistant: '说说你想办什么。',
    profile: '我的演示空间',
  };
  const go = useCallback((value: string) => {
    if (mobile && currentTab.current !== value) mobileHistory.current.push(currentTab.current);
    currentTab.current = value;
    setTab(value);
    if (mobile || window.innerWidth < 800)
      window.scrollTo({ top: 0, behavior: "instant" });
  }, [mobile]);
  const back = useCallback(() => {
    if (transferOpen) { setTransferOpen(false); return; }
    if (modal) { setModal(null); return; }
    const previous = mobileHistory.current.pop() || 'overview';
    currentTab.current = previous; setTab(previous); window.scrollTo({ top: 0, behavior: 'instant' });
  }, [modal, transferOpen]);
  useEffect(() => {
    if (!mobile) return;
    const nativeBack = (event: Event) => {
      if (!modal && !transferOpen && currentTab.current === 'overview' && !mobileHistory.current.length) return;
      event.preventDefault(); back();
    };
    window.addEventListener('bank-mobile-back', nativeBack);
    return () => window.removeEventListener('bank-mobile-back', nativeBack);
  }, [mobile, back, modal, transferOpen]);
  useEffect(() => {
    if (!mobile || !token) return;
    const resume = () => { void bankRequest<BankState>('/state', token).then(applyState).catch(handleError); };
    window.addEventListener('bank-mobile-resume', resume);
    return () => window.removeEventListener('bank-mobile-resume', resume);
  }, [mobile, token, applyState, handleError]);
  const monthsLabel = state?.referenceMonth
    ? `${state.referenceMonth.replace("-", " 年 ")} 月`
    : "本月";
  return (
    <div className={`ba-root ${mobile ? `bm-app bm-tab-${tab}` : ''}`}>
      {mobile && <header className="bm-header"><div>{tab !== 'overview' ? <button aria-label="返回上一页" onClick={back}><ChevronLeft size={23} /></button> : <span className="bm-brand"><Landmark size={20} /></span>}<strong>{({overview:'FinPilot',assistant:'AI 助手',audit:'待办与回执',profile:'我的',bills:'账单明细',cards:'卡片管理',services:'服务中心'})[tab]}</strong></div><span>模拟资金</span><button aria-label="手机刷新状态" onClick={refresh} disabled={busy || loading}><RefreshCw size={18} /></button></header>}
      <aside className="ba-sidebar">
        <a className="ba-logo" href="/bank-agent" aria-label="FinPilot 首页">
          <span className="ba-logo-mark">
            <Landmark size={23} />
          </span>
          <span>
            FinPilot<span className="ba-brand-dot">.</span>
            <small>你的金融行动助手</small>
          </span>
        </a>
        <div className="ba-workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="主要功能">
          {navItems.map((item) => (
            <button
              key={item.id}
              aria-label={item.title}
              title={item.title}
              className={tab === item.id ? "active" : ""}
              onClick={() => go(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.title}</span>
              {item.id === "audit" && !!pending.length && (
                <small>{pending.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="ba-sidebar-bottom">
          <div className="ba-boundary-card">
            <ShieldCheck size={22} />
            <strong>
              聪明地做事，
              <br />
              认真地守住边界。
            </strong>
            <p>
              查询自动完成
              <br />
              支出由你确认
              <br />
              敏感操作额外验证
            </p>
            <span>只使用虚构账户和资金</span>
          </div>
          <button
            className="ba-help"
            onClick={(e) => openModal("guide", e.currentTarget)}
          >
            <CircleHelp size={18} />
            演示说明
            <ArrowUpRight size={15} />
          </button>
          <div className="ba-profile">
            <span>F</span>
            <div>
              演示体验账户<small>本地会话 · 不关联真实银行</small>
            </div>
            <span className="ba-online-dot" />
          </div>
        </div>
      </aside>
      <div className="ba-workspace">
        <header className="ba-header">
          <div className="ba-breadcrumb">
            <span>个人工作空间</span>
            <ChevronRight size={13} />
            <strong>{navItems.find((n) => n.id === tab)?.title}</strong>
          </div>
          <div className="ba-header-actions">
            <span className="ba-sandbox-tag">
              <span />
              仅模拟资金
            </span>
            <button
              className="ba-icon-button"
              aria-label="刷新账户状态"
              title="刷新账户状态"
              onClick={refresh}
              disabled={busy || loading}
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="ba-new-session"
              onClick={(e) => openModal("reset", e.currentTarget)}
              disabled={busy || loading}
            >
              <Plus size={16} />
              <span>新演示账户</span>
            </button>
            <button
              className="ba-icon-button ba-mobile-help"
              aria-label="演示说明"
              onClick={(e) => openModal("guide", e.currentTarget)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <main className="ba-main">
          {mobile && tab === 'overview' && state && <MobileHome state={state} pending={pending.length} busy={busy} onNavigate={id => { if (id === 'audit') setTaskFilter('active'); go(id); }} onTransfer={() => setTransferOpen(true)} />}
          <section className="ba-intro">
            <div>
              <div className="ba-eyebrow">
                A LITTLE CLARITY. A LOT OF CONFIDENCE.
              </div>
              <h1>{titles[tab]}</h1>
              <p>
                把需求说清楚，剩下的一起办。
                <span>每一笔执行，都由你掌控。</span>
              </p>
            </div>
            <span className="ba-live-badge">
              <span className="ba-pulse" />
              {loading ? "连接本机后台" : state ? "沙箱已就绪" : "等待连接"}
            </span>
          </section>
          {error && (
            <div className="ba-error" role="alert" ref={errorBox}>
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button aria-label="关闭提示" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {!state && (
            <div className="ba-empty">
              <Loader2 size={26} className={loading ? "ba-spin" : ""} />
              <p>
                {loading
                  ? "正在加载你的独立演示账户…"
                  : connection.ready ? "请先启动银行测试服务，然后重试。" : connection.message}
              </p>
              <button className="ba-secondary" onClick={load}>
                重新连接
              </button>
            </div>
          )}
          {state && (
            <>
              {!mobile && <section className="ba-stats">
                <div className="ba-balance-card">
                  <div className="ba-balance-top">
                    <span>
                      <Wallet size={16} />
                      账户余额 <small>CNY</small>
                    </span>
                    <span className="ba-virtual-tag">虚构资产</span>
                  </div>
                  <strong data-testid="balance">{money(state.balance)}</strong>
                  <div className="ba-balance-bottom">
                    <div>
                      <span>可用余额</span>
                      <b>{money(state.available)}</b>
                    </div>
                    <div>
                      <span>已预留</span>
                      <b>{money(state.balance - state.available)}</b>
                    </div>
                    <span className="ba-card-orbit" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
                <div className="ba-spending-stat">
                  <span>
                    <ArrowUpRight size={16} />
                    本月消费
                  </span>
                  <strong>{money(total)}</strong>
                  <small>
                    {expenses.length} 笔虚构账单
                    <br />
                    转账单列，不重复计算
                  </small>
                </div>
                <button
                  className="ba-pending-stat"
                  onClick={() => {
                    if (mobile) { setTaskFilter('active'); go('audit'); return; }
                    if (pending.length && tab !== "audit")
                      document
                        .getElementById("bank-active-tasks")
                        ?.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        });
                    else go("audit");
                  }}
                >
                  <span>
                    <ShieldCheck size={17} />
                    等待你处理
                  </span>
                  <strong>
                    {pending.length.toString().padStart(2, "0")}
                    <small>项任务</small>
                  </strong>
                  <span className="ba-pending-link">
                    {pending.length ? "核对并授权" : "查看操作记录"}
                    <ArrowRight size={17} />
                  </span>
                </button>
              </section>}
              <div className={`ba-content-grid ba-page-${tab}`}>
                <div className="ba-left-content">
                  {tab === "services" && (
                    <>
                      <BankServices
                        compact={mobile}
                        state={state}
                        busy={busy}
                        now={now}
                        onPrepare={prepareManual}
                        onWorkflow={controlWorkflow}
                        onWorkflowDemo={demoWorkflow}
                        loadSandboxStatus={loadSandboxStatus}
                        onSandboxCompute={computeSandbox}
                      />
                      {!connection.native && <details className="ba-settings-disclosure"><summary>设备验证与安全设置</summary><PasskeyPanel auth={state.auth} busy={busy} onRegister={registerDevice} /></details>}
                    </>
                  )}
                  {mobile && tab === 'profile' && <section className="ba-panel bm-profile-panel"><div className="bm-profile-avatar">F</div><h2>我的演示账户</h2><p>虚构数据，不关联真实银行卡。</p><div className="bm-profile-status"><strong>{connection.native ? '手机安装版' : '手机网页预览'}</strong><span>{mode === 'ai' ? '已选择 AI 规划' : '离线案例 · 不调用 AI'}</span><small>{connection.message}</small></div><button onClick={() => go('services')}><Grid2X2 size={19} />服务与安全设置<ChevronRight size={17}/></button><button onClick={() => {setTaskFilter('all');go('audit');}}><History size={19}/>全部任务与回执<ChevronRight size={17}/></button><button onClick={exportAudit}><Download size={19}/>导出模拟操作记录<ChevronRight size={17}/></button><button onClick={e=>openModal('guide',e.currentTarget)}><CircleHelp size={19}/>功能与演示边界<ChevronRight size={17}/></button><button disabled={busy} onClick={e=>openModal('reset',e.currentTarget)}><Plus size={19}/>新建演示账户<ChevronRight size={17}/></button>{connection.native && <p className="ba-service-warning">手机容器的 Passkey 适配尚未验证。已绑定设备的账户不能降级到演示码；请勿在 App 中注册或迁移真实凭据。</p>}</section>}
                  {mobile && tab === 'profile' && <details className="ba-settings-disclosure"><summary>模型纠错记录 · {state.feedbackCount || 0} 条</summary><div className="ba-panel"><p>记录只用于人工审核，不自动加入提示词。导出后先脱敏，不要直接公开。</p><button className="ba-secondary" disabled={busy} onClick={exportFeedback}>导出待审核纠错</button></div></details>}
                  {!mobile && tab === "overview" && (
                    <>
                      <section className="ba-panel ba-spending-panel">
                        <div className="ba-panel-heading">
                          <div>
                            <span className="ba-section-kicker">
                              SPENDING OVERVIEW
                            </span>
                            <h2>这一个月，钱去了哪里？</h2>
                          </div>
                          <span>{monthsLabel}</span>
                        </div>
                        <div className="ba-spending-body">
                          <div
                            className="ba-donut"
                            style={{
                              background: ring
                                ? `conic-gradient(${ring})`
                                : "#e6e1d9",
                            }}
                            role="img"
                            aria-label={`本月消费 ${money(total)}，各分类金额见旁边列表`}
                          >
                            <div>
                              <span>本月支出</span>
                              <strong>{money(total)}</strong>
                              <small>{expenses.length} 笔消费记录</small>
                            </div>
                          </div>
                          <div className="ba-spending-legend">
                            {categories.map(([name, value], i) => (
                              <button
                                key={name}
                                onClick={() => {
                                  setSearch(name);
                                  setFilter("expense");
                                  setPeriod(state.referenceMonth);
                                  go("bills");
                                }}
                                aria-label={`查看${name}消费账单`}
                              >
                                <i
                                  style={{
                                    background: colors[i % colors.length],
                                  }}
                                />
                                <span>{name}</span>
                                <strong>{money(value)}</strong>
                                <small>
                                  {total
                                    ? Math.round((value / total) * 100)
                                    : 0}
                                  %
                                </small>
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          className="ba-panel-footer-link"
                          onClick={() => go("bills")}
                        >
                          每个数字，都可以回到账单里核对
                          <ArrowRight size={16} />
                        </button>
                      </section>
                      <section className="ba-panel ba-card-preview">
                        <div className="ba-panel-heading">
                          <h2>随身的卡，也要安心。</h2>
                          <button
                            className="ba-link-button"
                            onClick={() => go("cards")}
                          >
                            管理卡片
                            <ArrowRight size={15} />
                          </button>
                        </div>
                        <div className="ba-mini-card">
                          <div>
                            <span>
                              FinPilot <small>DEBIT · DEMO</small>
                            </span>
                            <CreditCard size={27} />
                          </div>
                          <div>
                            <div>
                              <small>{state.cards[0].name}</small>
                              <h3>
                                •••• &nbsp; •••• &nbsp; {state.cards[0].last4}
                              </h3>
                            </div>
                            <strong data-testid="card-status-8806">
                              {cardStatusLabel(state.cards[0].status)}
                            </strong>
                          </div>
                        </div>
                        <p className="ba-card-note">
                          <LockKeyhole size={13} />
                          挂失与解挂需要演示强验证，不关联真实卡片。
                        </p>
                      </section>
                    </>
                  )}
                  {((!mobile && tab === "overview") || tab === "bills") && (
                    <section className="ba-panel">
                      <div className="ba-panel-heading">
                        <div>
                          <span className="ba-section-kicker">
                            TRANSACTION JOURNAL
                          </span>
                          <h2>
                            {tab === "bills"
                              ? "演示账单明细"
                              : "最近发生的几笔"}
                          </h2>
                        </div>
                        {tab === "overview" ? (
                          <button
                            className="ba-link-button"
                            onClick={() => go("bills")}
                          >
                            查看全部
                            <ArrowRight size={15} />
                          </button>
                        ) : (
                          <span>{state.transactions.length} 条原始记录</span>
                        )}
                      </div>
                      {tab === "bills" && (
                        <>
                          <div className="ba-bill-filters">
                            <label className="ba-search">
                              <Search size={17} />
                              <input
                                aria-label="搜索账单"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="搜索商户、分类或交易编号"
                              />
                            </label>
                            <div>
                              <label>
                                <SlidersHorizontal size={15} />
                                <select
                                  aria-label="账单类型"
                                  value={filter}
                                  onChange={(e) => setFilter(e.target.value)}
                                >
                                  <option value="all">全部类型</option>
                                  <option value="expense">仅消费</option>
                                  <option value="transfer">仅转账</option>
                                  <option value="investment_buy">
                                    模拟申购本金
                                  </option>
                                  <option value="investment_redeem">
                                    模拟赎回本金
                                  </option>
                                  <option value="aa_receipt">
                                    AA 模拟入账
                                  </option>
                                </select>
                              </label>
                              <label>
                                <select
                                  aria-label="账单月份"
                                  value={period}
                                  onChange={(e) => setPeriod(e.target.value)}
                                >
                                  <option value="all">全部月份</option>
                                  {periods.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="ba-link-button"
                                onClick={() => {
                                  setSearch("");
                                  setFilter("all");
                                  setPeriod("all");
                                }}
                              >
                                清除筛选
                              </button>
                            </div>
                          </div>
                          <div className="ba-filter-summary">
                            <span>
                              找到 <strong>{rows.length}</strong> 笔
                            </span>
                            <span>
                              筛选结果流出合计{" "}
                              <strong>
                                {money(
                                  rows
                                    .filter((t) => !isIncoming(t.type))
                                    .reduce((n, t) => n + t.cents, 0),
                                )}
                              </strong>
                            </span>
                            {rows.some((t) => isIncoming(t.type)) && (
                              <span>
                                本金或 AA 模拟流入{" "}
                                <strong>
                                  {money(
                                    rows
                                      .filter((t) => isIncoming(t.type))
                                      .reduce((n, t) => n + t.cents, 0),
                                  )}
                                </strong>
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      <TransactionList
                        rows={
                          tab === "bills"
                            ? rows
                            : [...state.transactions]
                                .sort((a, b) => b.date.localeCompare(a.date))
                                .slice(0, 4)
                        }
                        detailed={tab === "bills"}
                      />
                      <div className="ba-data-note">
                        {tab === "bills"
                          ? "可筛选消费与转账。所有条目均为虚构样本，未读取任何真实银行账户。"
                          : "虚构账单样本 · 非银行实盘数据"}
                      </div>
                    </section>
                  )}
                  {tab === "cards" && (
                    <section className="ba-panel">
                      <div className="ba-panel-heading">
                        <div>
                          <span className="ba-section-kicker">
                            CARD CONTROL
                          </span>
                          <h2>{state.cards.length} 张卡，各有自己的边界。</h2>
                        </div>
                        <CreditCard size={22} />
                      </div>
                      <div className="ba-card-list">
                        {state.cards.map((c, i) => {
                          return (
                            <div
                              className={`ba-card-item ${i ? "ba-card-peach" : ""}`}
                              key={c.id}
                            >
                              <div className="ba-card-item-head">
                                <CreditCard size={25} />
                                <span
                                  className={`ba-pill ${c.status === "ACTIVE" ? "green" : "red"}`}
                                >
                                  {cardStatusLabel(c.status)}
                                </span>
                              </div>
                              <h3>{c.name}</h3>
                              <p>•••• &nbsp; •••• &nbsp; {c.last4}</p>
                              <div className="ba-card-limit">
                                <span>每日消费限额</span>
                                <strong>{money(c.limit)}</strong>
                              </div>
                              <div className="ba-card-actions">
                                <button
                                  className="ba-secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    prepareManual({
                                      type:
                                        c.status === "FROZEN"
                                          ? "unfreeze_card"
                                          : "freeze_card",
                                      cardLast4: c.last4,
                                    })
                                  }
                                >
                                  {c.status === "FROZEN"
                                    ? "请助手准备解挂"
                                    : "请助手准备挂失"}
                                  <ArrowRight size={14} />
                                </button>
                                <button
                                  className="ba-link-button"
                                  disabled={busy}
                                  onClick={() =>
                                    prepareManual({
                                      type: "card_limit",
                                      cardLast4: c.last4,
                                      limit: "500",
                                    })
                                  }
                                >
                                  将限额设为 ¥500
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="ba-data-note">
                        这些按钮由业务面板直接准备，不调用 AI。{" "}
                        挂失、解挂与调整限额均先生成待确认任务；冻结不等于冻结整个账户，也未接入真实消费授权系统。
                      </p>
                    </section>
                  )}
                  {tab === "audit" && (
                    <>
                      <section className="ba-panel">
                        <div className="ba-panel-heading">
                          <div>
                            <span className="ba-section-kicker">
                              TASK ARCHIVE
                            </span>
                            <h2>所有任务与完成回执</h2>
                          </div>
                          <span>{tasks.length} 项</span>
                        </div>
                        <div
                          className="ba-task-filter"
                          role="group"
                          aria-label="任务筛选"
                        >
                          {[
                            ["all", "全部"],
                            ["active", "待处理"],
                            ["done", "已完成"],
                            ["stopped", "未执行"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              aria-pressed={taskFilter === value}
                              onClick={() => setTaskFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="ba-archive-tasks">
                          {tasks
                            .filter((t) => {
                              const status = taskStatus(t, now);
                              return (
                                taskFilter === "all" ||
                                (taskFilter === "active" &&
                                  [
                                    "AWAITING_CONFIRMATION",
                                    "PENDING_REVIEW",
                                  ].includes(status)) ||
                                (taskFilter === "done" &&
                                  status === "SUCCEEDED") ||
                                (taskFilter === "stopped" &&
                                  [
                                    "CANCELLED",
                                    "EXPIRED",
                                    "SUPERSEDED",
                                  ].includes(status))
                              );
                            })
                            .map((t) => (
                              <TaskCard
                                key={t.id}
                                task={t}
                                now={now}
                                busy={busy}
                                onAction={act}
                                auth={state.auth}
                                compact
                              />
                            ))}
                          {!tasks.length && (
                            <div className="ba-no-results">
                              <History size={25} />
                              <p>还没有业务任务</p>
                              <small>
                                先查账单，或请助手准备一笔模拟操作。
                              </small>
                            </div>
                          )}
                        </div>
                      </section>
                      <details className="ba-panel ba-audit-details">
                        <summary>查看操作时间线与技术记录</summary>
                        <div className="ba-panel-heading">
                          <h2>可核查的操作时间线</h2>
                          <button
                            className="ba-link-button"
                            onClick={exportAudit}
                          >
                            <Download size={15} />
                            导出记录
                          </button>
                        </div>
                        <div className="ba-audit-list">
                          {state.audit.map((a) => (
                            <div className="ba-audit" key={a.id}>
                              <CircleDot size={15} />
                              <div>
                                <div>
                                  <strong>{a.event}</strong>
                                  <small>{timestamp(a.at)}</small>
                                </div>
                                <p>{a.detail}</p>
                                {a.taskId && <code>{a.taskId}</code>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="ba-data-note">
                          日志展示最近 120
                          条工具操作、授权与结果，不包含模型内部推理；本地演示记录不是不可篡改的银行审计系统。
                        </p>
                      </details>
                    </>
                  )}
                  <div className="ba-safety-strip">
                    <ShieldCheck size={20} />
                    <p>
                      <strong>聪明不等于擅自做主。</strong>
                      只有真实后台结果，才会成为你的完成回执。
                    </p>
                  </div>
                </div>
                <section className="ba-assistant" aria-label="银行助手">
                  <div className="ba-assistant-heading">
                    <span className="ba-assistant-avatar">
                      <Sparkles size={23} />
                    </span>
                    <div>
                      <h2>你的银行行动助手</h2>
                      <small>
                        <span className="ba-dot" />
                        {mode === "ai"
                          ? `${health?.provider || 'AI'} · AI 模式`
                          : "离线固定案例 · 非 AI"}
                      </small>
                    </div>
                    <span className="ba-assistant-wordmark">F.</span>
                  </div>
                  <div className="ba-mode-bar">
                    <span>理解需求的方式</span>
                    <select
                      aria-label="理解需求的方式"
                      value={mode}
                      onChange={(e) =>
                        setMode(e.target.value as "ai" | "offline")
                      }
                      disabled={busy}
                    >
                      <option value="ai" disabled={!health?.aiConfigured}>
                        {health?.provider || 'AI'} AI
                      </option>
                      <option value="offline">离线演示（非 AI）</option>
                    </select>
                  </div>
                  <div className="ba-scenario-list" aria-label="快速开始">
                    {suggestions.map((s) => (
                      <button
                        className="ba-scenario"
                        key={s.id}
                        title={s.title}
                        aria-label={s.title}
                        disabled={busy}
                        onClick={() => send(s.text, s.id)}
                      >
                        <s.icon size={18} />
                        <span>{s.short}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                  <div
                    className="ba-chat-body"
                    role="log"
                    aria-live="polite"
                    aria-label="助手对话"
                    ref={chatBody}
                  >
                    {state.history.length === 0 && <div className="ba-welcome">
                      <span className="ba-tiny-avatar">
                        <Sparkles size={15} />
                      </span>
                      <div>
                        <strong>少一点操作，多一点从容。</strong>
                        <p>
                          说说你想办什么。查账单可以直接完成；涉及钱和卡片，我会先准备详情，等你确认。
                        </p>
                      </div>
                    </div>}
                    {state.history.map((m) => (
                      <div className={`ba-message ${m.role}`} key={m.id}>
                        {m.role === "assistant" && (
                          <span className="ba-tiny-avatar">
                            <Sparkles size={14} />
                          </span>
                        )}
                        <div className="ba-message-content">
                          <p>
                            {m.role === "user" &&
                            /^业务面板提交[:：]/.test(m.text)
                              ? "通过业务面板准备了一项操作，尚需按权限确认。"
                              : m.text}
                          </p>
                          {m.results?.map((r, i) => (
                            <AnalysisResult key={i} result={r} />
                          ))}
                          {m.role === 'assistant' && m.meta?.mode === 'ai' && <PlannerFeedback busy={busy} onSave={correction => saveFeedback(m.id, correction)} />}
                          {m.meta && (
                            <details className="ba-message-source"><summary>{m.meta.mode === 'ai' ? 'AI 规划 · 后台核验' : m.meta.mode === 'manual' ? '表单操作 · 非 AI' : '固定案例 · 非 AI'}</summary><small>
                              {m.meta.mode === "ai"
                                ? `${m.meta.provider} / ${m.meta.model || '模型'} · ${(m.meta.latencyMs / 1000).toFixed(1)} 秒 · ${m.meta.totalTokens} tokens`
                                : m.meta.mode === "manual"
                                  ? "业务面板 · 用户填写（未调用 AI）"
                                  : "离线固定案例（未调用模型）"}
                              <br />
                              业务数字与执行结果均来自模拟账本
                            </small></details>
                          )}
                        </div>
                      </div>
                    ))}
                    {busy && (
                      <div className="ba-working">
                        <Loader2 size={16} className="ba-spin" />
                        <span>正在处理，请勿重复操作…</span>
                      </div>
                    )}
                  </div>
                  <form
                    className="ba-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(input);
                    }}
                  >
                    <label className="ba-sr-only" htmlFor="bank-message">
                      告诉助手你想做什么
                    </label>
                    <textarea
                      id="bank-message"
                      rows={2}
                      maxLength={1000}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        mode === "ai"
                          ? "试着说：给王明转两百元，先让我确认…"
                          : "离线模式不解析输入，请点击上方固定案例"
                      }
                      disabled={busy || mode === "offline"}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send(input);
                        }
                      }}
                    />
                    <div>
                      <span>
                        <LockKeyhole size={12} />
                        只输入虚构信息，不填真实账号
                      </span>
                      <button
                        aria-label="发送需求"
                        type="submit"
                        disabled={busy || !input.trim() || mode === "offline"}
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </form>
                  {state.lockedUntil > now && (
                    <div className="ba-locked" role="status">
                      <LockKeyhole size={17} />
                      敏感操作已锁定，剩余 {leftTime(state.lockedUntil, now)}
                      。查询仍可使用。
                    </div>
                  )}
                  {!mobile && tab !== "audit" && (
                    <div className="ba-task-area" id="bank-active-tasks">
                      <div className="ba-task-area-heading">
                        <h3>
                          {pending.length
                            ? "请你核对，再向前一步"
                            : "最近的办理结果"}
                        </h3>
                        {!!tasks.length && (
                          <button
                            className="ba-link-button"
                            onClick={() => go("audit")}
                          >
                            全部 {tasks.length} 项<ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                      {[...pending, ...recentFinished].map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          now={now}
                          busy={busy}
                          onAction={act}
                          auth={state.auth}
                          compact
                        />
                      ))}
                      {!tasks.length && (
                        <p className="ba-no-task">
                          <ShieldCheck size={16} />
                          尚未发起任何操作，账户状态没有变化。
                        </p>
                      )}
                    </div>
                  )}
                  <details className="ba-test-cases">
                    <summary>
                      也试试安全边界
                      <ChevronDown size={14} />
                    </summary>
                    <div>
                      <button
                        disabled={busy}
                        onClick={() => send("给李悦转 1200 元", "large")}
                      >
                        大额转账
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => send("给陈晨转 100 元", "ambiguity")}
                      >
                        同名收款人
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          send("给王明转 200 元", "transfer", true)
                        }
                      >
                        模拟接口超时
                      </button>
                    </div>
                    <p>演示边界处理，不会访问真实资金。</p>
                  </details>
                </section>
              </div>
              <footer className="ba-footer">
                <span>
                  <Landmark size={13} />
                  FinPilot Banking Lab · 国内赛题原型
                </span>
                <span>
                  {mode === "ai" ? "真实 AI 规划" : "离线固定案例 · 非 AI"} ·
                  虚构账户执行 · 非真实金融服务
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {mobile && <nav className="bm-bottom-nav" aria-label="手机主导航">{[{id:'overview',title:'首页',icon:LayoutDashboard},{id:'assistant',title:'助手',icon:MessageSquareText},{id:'audit',title:'待办',icon:ShieldCheck},{id:'profile',title:'我的',icon:UserRound}].map(item=><button key={item.id} aria-label={item.title} aria-current={tab===item.id?'page':undefined} className={tab===item.id?'active':''} onClick={()=>{if(item.id==='audit')setTaskFilter('active');go(item.id);}}><span><item.icon size={22}/>{item.id==='audit' && pending.length>0 && <b>{pending.length}</b>}</span><small>{item.title}</small></button>)}</nav>}
      {mobile && <MobileTransferSheet open={transferOpen} onOpenChange={setTransferOpen} state={state} busy={busy} onPrepare={prepareManual} />}
      <Dialog.Root
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="ba-modal-overlay" />
          <Dialog.Content
            className="ba-modal"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              opener.current?.focus();
            }}
          >
            <Dialog.Close className="ba-modal-close" aria-label="关闭">
              <X size={20} />
            </Dialog.Close>
            <span className="ba-modal-icon">
              <ShieldCheck size={29} />
            </span>
            <Dialog.Title>
              {modal === "reset"
                ? "创建新的演示账户？"
                : "一分钟，了解这个原型。"}
            </Dialog.Title>
            <Dialog.Description>
              {modal === "reset"
                ? "新账户会恢复初始虚构余额与账单。旧会话不会删除，但当前浏览器会切换账户；请先导出要保留的记录。"
                : "这是一个真实运行的银行业务沙箱，不是生产银行，也不会操作真实资金。"}
            </Dialog.Description>
            {modal === "reset" ? (
              <div className="ba-modal-actions">
                <button className="ba-secondary" onClick={exportAudit}>
                  先导出当前记录
                </button>
                <button className="ba-primary" disabled={busy} onClick={fresh}>
                  创建新账户
                </button>
              </div>
            ) : (
              <>
                <ol className="ba-guide-list">
                  <li>
                    <strong>看账单</strong>
                    <span>
                      点击“分析账单”，展开分类和待核对交易的原始依据。
                    </span>
                  </li>
                  <li>
                    <strong>转一笔钱</strong>
                    <span>
                      准备200元转账，确认之前不会扣款，完成后可以查回执。
                    </span>
                  </li>
                  <li>
                    <strong>管理卡片</strong>
                    <span>
                      挂失8806卡，获取页面内演示码，再确认卡片状态变化。
                    </span>
                  </li>
                  <li>
                    <strong>试安全边界</strong>
                    <span>
                      同名收款人会追问，接口超时进入待对账，不会编造成功。
                    </span>
                  </li>
                </ol>
                <div className="ba-guide-warning">
                  验证码不是短信或真实多因素认证。离线模式只运行固定案例；AI
                  模式会将输入发往
                  {health?.provider || '后端配置的模型供应商'}，请勿提供任何真实个人信息。本版本不执行模型生成的代码。
                </div>
                <button className="ba-primary" onClick={() => setModal(null)}>
                  开始体验
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
