import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Send, Unlink } from "lucide-react";
import { bankRequest, BankApiError } from "@/lib/bankApi";

// IM 渠道页: bind a Feishu identity with a one-time code (the code comes from the IM side, the approval
// happens here in the signed-in page), and a simulator that talks to the very same gateway code.
type ImStatus = { channel: string; bound: boolean; user: { name: string | null; id: string; boundAt: number } | null };
type Line = { from: "me" | "bot"; text: string };

export default function ImChannel({ token, onChanged, onOpenTasks }: { token: string; onChanged: () => void; onOpenTasks: () => void }) {
  const [status, setStatus] = useState<ImStatus | null>(null);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ applicant: { channel: string; name: string; id: string } } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ from: "bot", text: "这是 Orbit 的 IM 机器人（模拟器）。它和真实飞书机器人走同一套后台网关：先配对绑定，绿色查询直接回复，黄色操作给一次性确认码，红色操作只给网页链接。发\"帮助\"看看能做什么。" }]);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => { try { setStatus(await bankRequest<ImStatus>("/im/status", token)); } catch { /* shown elsewhere */ } }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [lines]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof BankApiError || e instanceof Error ? e.message : "请求失败"); } finally { setBusy(false); }
  };
  const say = (value: string) => run(async () => {
    const t = value.trim(); if (!t) return;
    setLines((l) => [...l, { from: "me", text: t }]); setText("");
    const r = await bankRequest<{ replies: string[]; status: ImStatus }>("/im/sim", token, { text: t });
    setLines((l) => [...l, ...r.replies.map((x) => ({ from: "bot" as const, text: x }))]);
    setStatus(r.status); onChanged();
    // Pick up a pairing code so the user can paste it with one tap.
    const pin = r.replies.join("\n").match(/配对码：([A-Z2-9]{8})/)?.[1]; if (pin) setCode(pin);
  });
  return (
    <section className="v3-im" aria-label="IM 渠道">
      <h2>IM 渠道</h2>
      <p className="v3-desk-note">赛题要求"用户可以通过 APP、IM 等渠道与 Agent 联通"。Orbit 接入飞书机器人（长连接，无需公网回调）。没有配置飞书应用时，用下面的模拟器体验同一套流程。</p>
      <div className="v3-im-bind">
        {status?.bound ? (
          <>
            <p><b>已绑定</b> {status.channel} 用户 {status.user?.name || ""} {status.user?.id}</p>
            <button className="ba-link-button" disabled={busy} onClick={() => run(async () => { setStatus(await bankRequest<ImStatus>("/im/unbind", token, {})); setPreview(null); })}><Unlink size={14} />解除绑定</button>
          </>
        ) : (
          <>
            <p>先在 IM 里给机器人发任意一句话，会收到 8 位配对码，再填到这里。</p>
            <label className="v3-case-input"><span className="ba-sr-only">配对码</span>
              <input value={code} maxLength={8} placeholder="8 位配对码" onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }} />
            </label>
            {!preview ? (
              <button className="ba-secondary" disabled={busy || code.length !== 8} onClick={() => run(async () => setPreview(await bankRequest("/im/bind/preview", token, { code })))}>查看是谁在申请</button>
            ) : (
              <div className="v3-im-preview">
                <p>申请绑定的是 <b>{preview.applicant.channel}</b> 用户 <b>{preview.applicant.name}</b>（{preview.applicant.id}）。确认是你本人吗？</p>
                <button className="ba-primary" disabled={busy} onClick={() => run(async () => { const r = await bankRequest<{ status: ImStatus }>("/im/bind/confirm", token, { code }); setStatus(r.status); setPreview(null); setCode(""); onChanged(); })}><Link2 size={14} />确认绑定</button>
                <button className="ba-link-button" onClick={() => setPreview(null)}>不是我</button>
              </div>
            )}
          </>
        )}
        {error && <p className="v3-im-error" role="alert">{error}</p>}
      </div>
      <div className="v3-im-chat" aria-label="IM 模拟器">
        <header>Orbit 机器人 · 模拟器</header>
        <div className="v3-im-lines">
          {lines.map((l, i) => <p key={i} className={l.from}>{l.text}{l.from === "bot" && /#task=/.test(l.text) && <button className="ba-link-button" onClick={onOpenTasks}>（模拟点开链接）去网页验证</button>}</p>)}
          <div ref={end} />
        </div>
        <div className="v3-im-quick">
          {["我的余额", "给小王转 200", "给李悦转 1200", "这个月的账单报告", "帮助"].map((q) => <button key={q} disabled={busy} onClick={() => void say(q)}>{q}</button>)}
        </div>
        <form className="v3-im-input" onSubmit={(e) => { e.preventDefault(); void say(text); }}>
          <input value={text} maxLength={500} placeholder="以 IM 用户身份发消息" onChange={(e) => setText(e.target.value)} aria-label="以 IM 用户身份发消息" />
          <button type="submit" aria-label="发送" disabled={busy || !text.trim()}><Send size={16} /></button>
        </form>
      </div>
    </section>
  );
}
