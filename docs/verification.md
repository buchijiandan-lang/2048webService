# 验证记录 · 2026-11-02

环境：Windows、Node v24.16.0、Microsoft Edge headless。独立审查后最终验证：

| 验证 | 结果 |
|---|---|
| npm test | 7 项通过、0 失败 |
| npm run test:ui | 通过：HTTP SOAP 移动、刷新恢复、双语、重开、胜利提交、榜单、360px、等高网格、跨局外呼竞态 |
| npm run evidence | GameService 5 个 + LeaderboardService 3 个方法全部成功，保存 16 个本地请求/响应 XML |
| npm audit --omit=dev | 0 vulnerabilities（本次审计时间） |
| 默认服务启动 | http://127.0.0.1:8080，/api/health 返回 soap/database ready |
| 官方外部 WSDL 下载 | 成功，保存于 contracts/number-conversion.wsdl |
| 外部 NumberToWords 真实调用 | 未通过：HTTP/HTTPS POST 均 ECONNRESET；沙箱外重试结果相同 |

测试包含四方向合并、单次合并、无变化/无路可走、同 requestId 重放、参数冲突、两个同时到达旧版本仅一个写成功、提交后锁定、继续后状态、终局可信分数、昵称验证、SQLite 重启恢复、超过 JavaScript 安全整数的 SOAP/SQLite 往返、空 SOAP 请求、DTD/ENTITY 拒绝、外部无效输入/失败/缓存/坏响应。

外部 fixture 仅在 tests 中用本地 HTTP 服务隔离验证客户端，不属于 DataAccess 成功证据。UI 截图同样来自测试数据库，有明确标注的 UI tester 记录；正常运行库未灌入成绩。

官方 WSDL SHA256：`C544123D2D3E6CCCA67CE79E9F659FB5D191F40C35E68CC15D9746534721E454`。

独立代码审查未发现 Critical/Important 缺陷；两个次要问题（空 SOAP 参数内部错误类型、跨局英文状态）已加入失败回归测试并修复。未人工验证 SoapUI GUI；未取得外部成功响应。此两点不能用自动测试成功替代。
