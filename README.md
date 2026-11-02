# 2048 · SOAP Arcade

新增：**GreyPhillips 外部时间 SOAP**，页面显示换算后的北京时间和同步状态。完整规范见 [时间服务方案](docs/time-service-plan.md)，实测结果见 [时间验证记录](docs/time-verification.md)。组成更新为两个自建 SOAP + 两个外部 SOAP 集成；时间服务已取得真实成功响应，DataAccess 的原失败记录仍单独保留。

时间接口：`GET /api/time`。默认成功缓存 60 秒、失败冷却 15 秒、单次超时 5 秒；`TIME_ENDPOINT` / `TIME_TIMEOUT_MS` 可覆盖。页面显示的是外部采样，不是标准授时，也不参与排行榜排序。实测该源相较本机接收时间慢约 3 分 40 秒。

验证命令：`node scripts/time-evidence.js`（真实 SOAP，两次采样）、`node scripts/time-ui-check.js`（隔离 UI 测试）；原有 `npm test`、`npm run test:ui` 仍有效。以下旧章节的“两个自建加一个外部”是初版记录，以本补充为准。

可玩的 2048 网页，核心操作真实经过 SOAP over HTTP。技术栈为 **Node.js 24 + node-soap + Express + SQLite**，不依赖旧 Java/Maven 工程。

## 启动

在 PowerShell 中执行：

```powershell
cd D:\code\2048webService
npm.cmd ci --cache .npm-cache --registry https://registry.npmjs.org
npm.cmd start
```

打开 http://127.0.0.1:8080 。Node.js 要求 24 或更新的兼容版本（当前验证 24.16.0）。关闭终端进程停止服务。SQLite 文件保存在 `data/2048.db`，重启不丢游戏、榜单和幂等记录。浏览器使用 localStorage 恢复游戏；清除浏览器数据后原局仍在数据库，但不自动找回 ID。

```powershell
# 可选配置，设置后 npm.cmd start
$env:PORT='8081'
$env:DB_PATH='D:\code\2048webService\data\custom.db'
$env:NUMBER_TIMEOUT_MS='5000'
# 故障演示：真实连接失败；新进程没有成功缓存
$env:NUMBER_ENDPOINT='http://127.0.0.1:1/unavailable'
```

默认只监听本机，不是公开部署版。无需创建外部账户或提供密钥。

## 服务与调用链

| 服务 | WSDL | 方法 |
|---|---|---|
| 自建 GameService | http://127.0.0.1:8080/ws/game?wsdl | NewGame、GetGame、Move、ContinueAfterWin、ResetGame |
| 自建 LeaderboardService | http://127.0.0.1:8080/ws/leaderboard?wsdl | SubmitScore、GetTopScores、GetBestScoreByNickname |
| 外部 DataAccess | https://www.dataaccess.com/webservicesserver/NumberConversion.wso?WSDL | NumberToWords |

浏览器 JSON → `src/server.js` → node-soap 从 WSDL 生成的动态代理 → 本机 HTTP `/ws/game` 或 `/ws/leaderboard` → `src/store.js` → SQLite。JSON 适配层没有直接调用游戏领域方法。排行榜端点在事务内读取可信游戏快照，不接受客户端分数。外部调用使用官方保存的 WSDL、SOAP 1.1 binding、真实网络请求。

**服务数量口径：两个自建 SOAP + 一个外部 SOAP。没有声称满足“两个外部 SOAP”要求。**

## 当前验证状态

- 规则、真实 HTTP SOAP、版本冲突、幂等、重启恢复、持久化、外部失败测试：`npm.cmd test`。
- Edge 浏览器桌面与 360px 检查：`npm.cmd run test:ui`（需安装 Microsoft Edge）。截图在 `docs/screenshots/`。UI 测试使用独立内存数据库，截图中的 UI tester 是明确标注的测试记录。
- 全部八个本地 SOAP 方法的真实 XML：`npm.cmd run evidence`，输出 `docs/soap-samples/`。该脚本使用独立临时数据库，明确注入胜利/终局测试夹具，正常应用无作弊或测试端点。
- **2026-11-02 外部实测：官方 WSDL 下载成功，但 NumberToWords POST 返回 ECONNRESET。尚未取得外部成功响应，不应宣称该验收项完成。** 失败详情见 `docs/soap-samples/external-probe.json`、`verification.json`。测试中的英文响应为隔离 HTTP fixture，仅验证客户端行为，不作为外部服务成功证据。

## 玩法和规则

方向键、WASD、滑动或手机方向按钮移动。WON 时可继续，或提交分数并锁定该局。LOST 可提交。提交后状态 FINISHED，不可继续；新游戏会创建新 ID，未提交旧局标记 ABANDONED。刷新能恢复当前局。支持中文与英文静态资源、个人最佳查询。

所有写操作使用 UUID requestId；同请求同参数返回原响应，同 ID 不同参数拒绝。Move/Continue/Reset/Submit 需要 expectedVersion；过期返回 409。无变化移动不增版本、不生成块。相同 gameId 的重复成绩提交返回原记录。分数以十进制字符串传 JSON，内部 BigInt、SQLite INTEGER、WSDL xsd:long，避免 JavaScript 精度丢失。

## 文档

- `docs/design.md`：技术选择和冲突裁决，优先于旧规范的技术建议。
- `docs/2048-soap-integration-spec.md`：完整复制的交接基线，原目录未改。
- `docs/demo.md`：10 分钟演示、复现命令、报告材料和限制。
- `contracts/`：可导入 SoapUI 的固定 WSDL；本地发布时地址按 PORT 替换。
- `scripts/build-contracts.js`：本地契约生成；`npm.cmd run contracts` 可重建。

未实现可选撤销、音效和认证；不是多人竞争或生产反作弊系统。匿名昵称不是身份认证。健康接口 `/api/health` 中外部状态为最近调用结果，不会额外阻塞外呼。
