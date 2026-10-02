# 手机端第一阶段

本地分支：`feat/mobile-app`。使用既有React和银行后台，加独立移动入口与Capacitor Android工程。没有推送、没有公网部署、没有真实银行交易，也没有付费AI测试。

## 现在能看什么

电脑预览：http://localhost:8091 。也可在现有银行服务重新构建后打开 http://localhost:5091/mobile 。这些仍是电脑本机地址，不是队友手机可直接访问的地址。

双击 `mobile/启动手机版预览.cmd`。它先启动现有银行后台，再构建手机版并打开电脑浏览器。普通网页仍在 `/bank-agent`，没有删除。

停止时双击 `mobile/停止手机版预览.cmd`，只结束核验为本项目的预览与银行服务，保留模拟账户。若端口属于其他程序，会拒绝操作。

- 首页：简洁问候、助手入口、转账/账单/卡片/服务快捷入口、账户概览。
- 助手：单列聊天和结果，不混排桌面大面板。
- 待办：需求生成后进入核对页；确认前不动钱，完成后显示回执。
- 首页转账提供手工表单，不依赖AI密钥；收款人必须选择唯一联系人，余额不足在表单内展示后台原因。
- 我的：服务、安全设置、记录、导出与新演示账户。
- 增加返回导航、安全区、输入键盘适配；Android硬件返回的真机表现尚未实测。

## Android工程不是已完成的安装包

已生成 `android/` 原生工程并同步移动网页资源；目前机器没有Java/Android SDK，尚未产出或在真机安装APK。不要把网页截图当作Android运行证明。

环境检查（在仓库根目录）：

```powershell
node scripts/mobile-doctor.mjs
```

具备官方要求的Android Studio、SDK和Java后，先构建同步，再打开工程进行调试构建：

```powershell
npm run mobile:sync
```

```powershell
npm run mobile:android
```

安装包签名、商店账号与iOS构建未配置。iOS本地构建还需要Mac/Xcode，当前只生成Android工程。

## 手机怎么连接后台

浏览器预览继续使用同来源 `/api/bank` 代理，不改变原后台权限。手机容器读取构建时 `VITE_BANK_API_ORIGIN`，只允许无凭据、无路径的明确HTTPS来源。

待用户批准测试服务器/域名后，在仓库根目录 `.env.mobile.local` 设置：

```text
VITE_BANK_API_ORIGIN=https://YOUR_APPROVED_TEST_SERVER
```

只配置URL不等于已经可用。当前银行服务仍只绑定回环、拒绝未知Host/Origin；必须另外完成HTTPS、认证/会话隔离、明确来源白名单和部署验证，不能简单改为任意来源。未配置URL时安装版不会请求银行API或编造余额。

**不要填写DeepSeek密钥，不要创建任何 `VITE_*API_KEY`。** 手机只向后台发送用户需求，后台才能使用模型密钥。当前原生会话令牌只用临时sessionStorage，并按后台来源分开，不冒充已经提供了安全密钥存储。

Passkey的手机容器适配未验证，原生页面不提供注册入口；已绑定账户不能降级到OTP。原生验证与真实设备安全存储应另做任务绑定方案，不复制桌面localhost凭据。

## 范围与测试

手机浏览器390px/320px、需求到确认、回执、返回、刷新、未配置原生连接的阻断为本地自动化范围。键盘和原生检测有明确模拟用例，不代表实际Android/iPhone硬件已测。

```powershell
node scripts/check-mobile-browser.mjs
```

该脚本需要预览与后台已启动，强制离线固定案例并拦截真实模型调用。首次检查中的原生桥模拟方式不正确，失败记录保留；修正为Capacitor实际平台检测接口后通过。

依赖：Capacitor core/cli/android 8.5.2，App 8.1.1、Keyboard 8.0.5；按官方文档接入。没有引入另一套银行账务引擎，也未全面替换界面组件库。

2026-10-02本轮验证：移动类型检查与Lint通过，10项前端测试、59项后端回归、8组真实Chrome手机/桌面检查通过；网页和手机版构建及Android资源同步成功。原生平台标识及键盘状态的部分用例为明确模拟，Android XML仅做语法检查，没有APK编译/真机验收。新增Capacitor CLI后npm报告32项既有或传递依赖告警，未盲目强制修复，不能声称依赖已全面安全。

参考：[Capacitor现有项目接入](https://capacitorjs.com/docs/getting-started)、[构建环境](https://capacitorjs.com/docs/getting-started/environment-setup)。
