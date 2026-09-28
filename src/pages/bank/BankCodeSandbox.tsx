import { useCallback, useEffect, useState } from "react";
import {
  Braces,
  Play,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock3,
  CheckCircle2,
} from "lucide-react";
import type { BankSandboxStatus, BankSandboxResponse } from "@/lib/bankApi";

const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(
    cents / 100,
  );
const presets = [
  {
    id: "sum",
    name: "两数求和",
    inputs: ["120", "80"],
    hint: "120 + 80。纯整数运算，不读取账户。",
    wat: '(module\n  (func (export "calculate") (param i64 i64) (result i64)\n    local.get 0\n    local.get 1\n    i64.add))',
  },
  {
    id: "split",
    name: "24000 分除以 3",
    inputs: ["24000", "3"],
    hint: "示例输入单位为分：24000 ÷ 3 = 8000。不发起 AA 或转账。",
    wat: '(module\n  (func (export "calculate") (param i64 i64) (result i64)\n    local.get 0\n    local.get 1\n    i64.div_s))',
  },
  {
    id: "loop",
    name: "无限循环拦截",
    inputs: ["0", "0"],
    hint: "故意不给循环出口，检查真实指令预算是否会终止执行。",
    wat: '(module\n  (func (export "calculate") (param i64 i64) (result i64)\n    (loop $again\n      br $again)\n    i64.const 0))',
  },
];
function validInteger(value: string) {
  if (!/^-?(0|[1-9]\d*)$/.test(value) || value.length > 20 || value === "-0") return false;
  try {
    const n = BigInt(value);
    return n >= -(2n ** 63n) && n < 2n ** 63n;
  } catch {
    return false;
  }
}
type RunRecord = {
  response: BankSandboxResponse;
  wat: string;
  inputs: [string, string];
  balanceBefore: number;
  at: string;
};

export default function BankCodeSandbox({
  busy,
  balance,
  loadStatus,
  onCompute,
}: {
  busy: boolean;
  balance: number;
  loadStatus: () => Promise<BankSandboxStatus>;
  onCompute: (
    wat: string,
    inputs: [string, string],
  ) => Promise<BankSandboxResponse | undefined>;
}) {
  const [status, setStatus] = useState<BankSandboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [preset, setPreset] = useState("sum");
  const [wat, setWat] = useState(presets[0].wat);
  const [inputs, setInputs] = useState<[string, string]>(["120", "80"]);
  const [running, setRunning] = useState(false);
  const [record, setRecord] = useState<RunRecord | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setProblem("");
    try {
      setStatus(await loadStatus());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "无法获取后台计算环境状态。");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const bytes = new TextEncoder().encode(wat).length;
  const limit = status?.limits.watBytes || 8192;
  const invalidInputs = inputs.some((value) => !validInteger(value));
  const stale =
    !!record &&
    (record.wat !== wat ||
      record.inputs.some((value, i) => value !== inputs[i]));
  const execute = async () => {
    if (
      busy ||
      running ||
      !status?.installed ||
      invalidInputs ||
      !wat.trim() ||
      bytes > limit
    )
      return;
    setRunning(true);
    setProblem("");
    const current = {
      wat,
      inputs: [...inputs] as [string, string],
      balanceBefore: balance,
      at: new Date().toISOString(),
    };
    try {
      const response = await onCompute(current.wat, current.inputs);
      if (response) setRecord({ ...current, response });
      else
        setProblem(
          "本次未取得计算响应。没有把结果写入账本，请核对上方后台提示。",
        );
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "本次没有取得有效计算结果。");
    } finally {
      setRunning(false);
    }
  };
  const calculation = record?.response.calculation;
  const metrics = calculation?.metrics;
  return (
    <>
      <section className="ba-panel ba-code-intro">
        <div className="ba-panel-heading">
          <div>
            <span className="ba-section-kicker">UNTRUSTED CODE, CONTAINED</span>
            <h2>让代码计算，不让代码碰钱。</h2>
          </div>
          <Braces size={24} />
        </div>
        <p className="ba-service-intro">
          WAT 是 WebAssembly 的文本格式。这里把手工或预置代码交给后台的独立
          Wasmtime 子进程，只开放两个 64
          位整数输入与一个整数输出；没有银行执行权限。
        </p>
        <div className="ba-code-disclosure">
          <ShieldCheck size={18} />
          <p>
            这些都是<strong>预置演示或手工代码，未调用实时模型</strong>
            。沙箱结果属于低信任计算，不能直接写账、转账或修改账户。本页也不是实时模型生成代码的完整集成。
          </p>
        </div>
        <div className="ba-panel-heading ba-code-status-heading">
          <h3>后台计算环境</h3>
          <button
            className="ba-link-button"
            disabled={loading || running || busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
            刷新计算环境
          </button>
        </div>
        {loading ? (
          <p className="ba-service-intro">正在读取后台运行时状态…</p>
        ) : status ? (
          <>
            <span
              className={`ba-pill ${status.installed ? "green" : "yellow"}`}
            >
              {status.installed ? "运行时实测可用" : "运行时暂不可用"}
            </span>
            <span className="ba-runtime-name">
              {status.runtime} · {status.version}
            </span>
            <dl className="ba-code-limits">
              <div>
                <dt>指令预算</dt>
                <dd>{status.limits.fuel.toLocaleString()} fuel</dd>
              </div>
              <div>
                <dt>内存上限</dt>
                <dd>
                  {(status.limits.memoryBytes / 1024).toLocaleString()} KiB
                </dd>
              </div>
              <div>
                <dt>最长等待</dt>
                <dd>{status.limits.deadlineMs} ms</dd>
              </div>
              <div>
                <dt>并发上限</dt>
                <dd>{status.limits.concurrent} 个</dd>
              </div>
            </dl>
            <p className="ba-service-caption">
              {status.statusNote}{" "}
              禁止外部导入：不能调用网络、文件或宿主函数。fuel
              是运行时指令计量单位，不等于精确的代码行数。
            </p>
            {!status.installed && (
              <div className="ba-code-install">
                <AlertTriangle size={20} />
                <div>
                  <strong>未执行任何计算</strong>
                  <p>
                    请在 UniTally 仓库目录创建专用 .venv-sandbox 环境，并安装锁定依赖。
                    不要在无关的全局环境安装，也不需要配置 API 密钥。
                  </p>
                  {(status.installCommands || []).map(command => <pre key={command}><code>{command}</code></pre>)}
                </div>
              </div>
            )}
          </>
        ) : null}
        {problem && (
          <div className="ba-service-warning" role="alert">
            {problem}
          </div>
        )}
      </section>
      <section className="ba-panel">
        <div className="ba-panel-heading">
          <h2>选个例子，看看真实执行结果。</h2>
          <span>预置演示 · 未调用实时模型</span>
        </div>
        <div className="ba-code-presets" role="group" aria-label="计算沙箱预置">
          {presets.map((example) => (
            <button
              key={example.id}
              disabled={busy || running}
              aria-pressed={preset === example.id}
              onClick={() => {
                setPreset(example.id);
                setWat(example.wat);
                setInputs([...example.inputs] as [string, string]);
                setProblem("");
              }}
            >
              {example.name}
            </button>
          ))}
        </div>
        <p className="ba-service-caption">
          {preset
            ? presets.find((p) => p.id === preset)?.hint
            : "手工编辑的代码。后台会独立检查接口、外部导入和资源限制。"}
        </p>
        <form
          className="ba-code-form"
          onSubmit={(e) => {
            e.preventDefault();
            void execute();
          }}
        >
          <label>
            WAT 代码
            <textarea
              aria-label="WAT 代码"
              spellCheck={false}
              rows={9}
              value={wat}
              disabled={busy || running}
              onChange={(e) => {
                setWat(e.target.value);
                setPreset("");
              }}
            />
          </label>
          <div className="ba-code-size">
            {bytes.toLocaleString()} / {limit.toLocaleString()} UTF-8 字节
            {bytes > limit ? " · 超出上限，不能执行" : ""}
          </div>
          <div className="ba-code-inputs">
            {inputs.map((input, i) => (
              <label key={i}>
                整数输入 {i + 1}
                <input
                  aria-label={`沙箱整数输入${i + 1}`}
                  inputMode="text"
                  autoComplete="off"
                  value={input}
                  disabled={busy || running}
                  onChange={(e) => {
                    setInputs(
                      (current) =>
                        current.map((v, j) =>
                          j === i ? e.target.value : v,
                        ) as [string, string],
                    );
                    setPreset("");
                  }}
                />
              </label>
            ))}
          </div>
          {invalidInputs && (
            <p className="ba-service-warning">
              只接受有符号 64
              位范围内的十进制整数，不接受小数、指数格式或超出范围的整数。
            </p>
          )}
          <p className="ba-code-warning">
            i64 加减乘超出 64
            位范围会环绕，不是金融金额校验。整数除法也不是自动分账规则；不要把本页结果当成已校验的账务指令。
          </p>
          <button
            className="ba-primary"
            disabled={
              busy ||
              running ||
              !status?.installed ||
              loading ||
              invalidInputs ||
              bytes > limit ||
              !wat.trim()
            }
          >
            {running ? <Clock3 size={16} /> : <Play size={16} />}在计算沙箱运行
          </button>
        </form>
      </section>
      <section className="ba-panel ba-code-result" aria-live="polite">
        <div className="ba-panel-heading">
          <h2>运行记录，而不是银行回执。</h2>
          <Braces size={21} />
        </div>
        {!record || !calculation ? (
          <div className="ba-no-results">
            <Play size={25} />
            <p>还没有执行结果</p>
            <small>点击运行后才会请求后台，不预先填入成功答案。</small>
          </div>
        ) : (
          <>
            {stale && (
              <p className="ba-service-warning">
                下方是上一次执行记录。当前编辑已经变化，尚未重新运行。
              </p>
            )}
            <div
              className={`ba-compute-outcome ${calculation.ok ? "success" : "blocked"}`}
            >
              {calculation.ok ? (
                <CheckCircle2 size={24} />
              ) : (
                <AlertTriangle size={24} />
              )}
              <div>
                <span>
                  {calculation.ok
                    ? "计算完成 · 低信任结果"
                    : "执行被拒绝或终止"}
                </span>
                {calculation.ok ? (
                  <strong data-testid="sandbox-result">
                    {calculation.result}
                  </strong>
                ) : (
                  <>
                    <strong data-testid="sandbox-error">
                      {calculation.error?.code || "UNKNOWN_ERROR"}
                    </strong>
                    <p>
                      {calculation.error?.message ||
                        "后台没有返回有效计算结果。"}
                    </p>
                  </>
                )}
              </div>
            </div>
            <dl className="ba-code-limits">
              <div>
                <dt>后台实测耗时</dt>
                <dd>
                  {typeof metrics?.elapsedMs === "number"
                    ? `${metrics.elapsedMs.toFixed(1)} ms`
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>已消耗指令预算</dt>
                <dd>
                  {metrics?.fuelConsumed == null
                    ? "未计量"
                    : metrics.fuelConsumed.toLocaleString()}{" "}
                  / {metrics?.fuelLimit?.toLocaleString() || "—"}
                </dd>
              </div>
              <div>
                <dt>运行内存上限</dt>
                <dd>
                  {metrics?.memoryLimitBytes
                    ? `${metrics.memoryLimitBytes / 1024} KiB`
                    : "未提供"}
                </dd>
              </div>
              <div>
                <dt>允许的外部导入</dt>
                <dd>
                  {Array.isArray(metrics?.importsAllowed)
                    ? metrics.importsAllowed.length
                    : (metrics?.importsAllowed ?? "未提供")}
                </dd>
              </div>
            </dl>
            <div className="ba-code-hash">
              <span>后台代码哈希</span>
              <code>{metrics?.codeHash || "未提供；不能伪造校验值"}</code>
            </div>
            <div className="ba-code-balance">
              <ShieldCheck size={18} />
              <div>
                <strong>
                  {record.balanceBefore === record.response.state.balance
                    ? "运行前后账户余额未变"
                    : "页面先前余额与后台返回不同，请另行核对账户记录"}
                </strong>
                <p>
                  运行前页面 {money(record.balanceBefore)} → 后台返回{" "}
                  {money(record.response.state.balance)}
                </p>
                <small>计算结果未成为账务指令，不具有转账授权。</small>
              </div>
            </div>
            <details className="ba-evidence">
              <summary>查看此记录对应的代码和输入</summary>
              <div className="ba-code-snapshot">
                <p>提交时间 {record.at}</p>
                <p>输入：{record.inputs.join("，")}</p>
                <pre>{record.wat}</pre>
              </div>
            </details>
          </>
        )}
      </section>
    </>
  );
}
