# 团队临时 HTTPS 演示

这不是长期云部署。Cloudflare Quick Tunnel 只用于临时体验，不保证可用性；电脑睡眠、关机或网络断开，链接便不可用。国内微信或校园网络可能无法访问，需队友实测。新开隧道通常会换网址。

## 已实现的边界

- 仅把 `127.0.0.1:5093` 的独立分享网关连到外部，不公开原来 5091/8091 的开发服务。
- 整站（包括 API、静态文件）要求团队登录；口令随机生成，保存在忽略提交的 `.cache/team-share/access.json`。不要提交或公开此文件。
- Secure / HttpOnly / SameSite Cookie；会话最多 8 小时；分享最多 24 小时。未登录、错误 Host/Origin、跨站写请求被拒绝。全局登录尝试与请求次数有限制。
- 独立账本 `backend/data/team-share.json`，不复制个人演示账户。不同浏览器创建独立模拟账户。
- 团队 AI 每天合计最多 20 次，账本持久化配额；不是金额预算保证。离线案例不调用模型。DeepSeek 密钥继续仅在后端 `.env.bank.local`。
- 不开放设备密钥注册、Passkey 操作、Wasm 代码执行；页面内演示验证码不是真实银行认证。分享版不应被描述为完整生产级银行安全实现。
- 口令不是个人身份认证；请仅给可信队友。不要填写真实敏感数据。AI 对话会经后端发送给 DeepSeek；HTTPS 由 Cloudflare 终止，因此也依赖该服务商。

## 开启与停止

技术队友先安装依赖、生成 `dist-mobile`，再从 Cloudflare 官方 GitHub release 下载 Windows amd64 的 cloudflared 到 `.cache/team-share/cloudflared.exe`，核对官方 SHA-256。该工具不提交到仓库。

在仓库目录运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-team-share.ps1`。脚本生成随机口令、24 小时到期时间及进程身份记录；重新启动会轮换口令及链接，需要重新通知队友。发送前必须实际验证外部 HTTPS 页面及登录流程，脚本输出启动成功不等于互联网可达。

结束时双击 `mobile/停止团队分享.cmd`，或运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-team-share.ps1`。脚本核对 PID、启动时间、完整程序路径/命令行，只停止这次分享，不停止本机演示，不删账本。页面 `/team` 可退出团队登录。

不要把口令写进 URL、README 或 GitHub Issue。建议网址与口令分开发给队友。

## 验证

`node --test backend/test/team-share.test.js backend/test/bank.test.js` 覆盖访问控制、跨站拒绝、登录限额、Cookie 撤销、分享过期、独立模拟账户、禁用能力、敏感路径和 AI 配额（mock，无付费请求）。

官方说明：https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
