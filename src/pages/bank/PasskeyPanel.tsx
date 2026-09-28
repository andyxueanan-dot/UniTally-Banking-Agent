import { useState } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  Fingerprint,
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { passkeyLocalUrl, type BankState } from "@/lib/bankApi";

export default function PasskeyPanel({
  auth,
  busy,
  onRegister,
}: {
  auth: BankState["auth"];
  busy: boolean;
  onRegister: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const supported = browserSupportsWebAuthn();
  const url = passkeyLocalUrl(auth?.origin);
  if (!auth) return null;
  return (
    <section className="ba-panel ba-passkey-panel">
      <div className="ba-panel-heading">
        <div>
          <span className="ba-section-kicker">YOUR DEVICE, YOUR APPROVAL</span>
          <h2>给敏感操作，加一道设备验证。</h2>
        </div>
        <Fingerprint size={25} />
      </div>
      <p className="ba-service-intro">
        Passkey（通行密钥）可通过支持的 Windows
        Hello、设备或安全密钥验证。它只绑定当前虚构会话，不是银行实名核验，也不代表你持有真实银行账户。
      </p>
      {auth.mode === "passkey" ? (
        <div className="ba-passkey-ready" role="status">
          <CheckCircle2 size={23} />
          <div>
            <strong>当前演示会话已绑定设备凭据</strong>
            <p>
              红色操作必须完成设备签名，不能降级为页面内演示码。请在任务卡核对金额与对象；系统设备弹窗不保证显示这些支付详情。
            </p>
          </div>
        </div>
      ) : !auth.canRegister ? (
        <div className="ba-passkey-origin">
          <ShieldCheck size={22} />
          <p>
            设备验证只在固定的 localhost 入口注册。IP 与 localhost
            的浏览器会话独立，跳转后不会迁移当前账户或记录。
          </p>
          {url && (
            <a href={url}>
              打开设备验证入口
              <ArrowUpRight size={15} />
            </a>
          )}
          <small>当前仍可使用明确标注的页面内模拟验证码。</small>
        </div>
      ) : !supported ? (
        <p className="ba-service-warning">
          当前浏览器不支持 WebAuthn
          设备验证，不能假装已完成注册。可换支持的浏览器；当前会话仍是模拟验证码模式。
        </p>
      ) : (
        <>
          <label className="ba-passkey-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              我理解：将为此虚构会话创建设备凭据；绑定后敏感操作不能回退到演示码，本原型未提供凭据恢复。
            </span>
          </label>
          <button
            className="ba-primary"
            disabled={busy || !consent}
            onClick={onRegister}
          >
            <Fingerprint size={17} />
            为此演示账户绑定设备
          </button>
          <p className="ba-service-caption">
            只有点击后才请求系统注册。取消系统弹窗不会执行银行业务。
          </p>
        </>
      )}
    </section>
  );
}
