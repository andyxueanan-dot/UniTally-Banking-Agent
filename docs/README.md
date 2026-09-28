# 文档导航

不看代码的队友请回到 [首页](../README.md)，按“第一次体验”操作即可。

## 当前银行原型

- [开发者安装与历史记录](development/BANK_AGENT_DEMO.md)
- [质量迭代、功能覆盖与限制](development/BANK_QUALITY_PROGRESS.md)
- [安全自评开发稿](development/BANK_SECURITY_REVIEW.md)

以上文档中的命令和源码路径相对于仓库根目录，不要在 `docs/` 内执行安装命令。

## 历史资料

- [原记账应用说明](archive/README_ACCOUNTING.md)
- [原记账应用更新记录](archive/CHANGELOG.md)
- [原 Firebase 部署说明](archive/FIREBASE_DEPLOYMENT.md)
- [T001 学费沙箱](archive/T001_DEMO.md)

旧 Windows 启停脚本移至 `archive/launchers/`，以 `.bat.txt` 原样保存，防止误点旧入口或误停其他程序。旧记账功能代码没有删除；需要运行时按开发命令启动5000/8080，不直接执行历史脚本。

旧 Bun 锁文件放在 `archive/tooling/`，本分支以根目录 `package-lock.json` 和 `npm ci` 为安装依据。旧 Vite 时间戳产物放在 `archive/generated/`；旧 `providers.csv` 放在 `data/reference/`，内容未修改。

根目录保留 Vite、TypeScript、Tailwind、npm和Firebase配置，因为工具按约定路径读取它们。此次不迁移源码，不改变金融业务行为。
