# 外部时间 SOAP 集成方案

日期：2026-11-02。用户已批准实现及测试后推送现有 GitHub 仓库 main 分支。

## 目标与范围
新增独立时间卡片，显示经公开外部 SOAP 获取并转换为 Asia/Shanghai 的时间。两个自建服务保留，外部服务扩展为 DataAccess Number Conversion 与 GreyPhillips 时间接口。各外部成功状态分别记录，不因时间成功就声称数字转换成功。不更改游戏、榜单和数据库时间来源。

## 技术决策与契约
选用 GreyPhillips，官方 WSDL https://beta.greyphillips.com/apis/soap/argos/acl.asmx?WSDL ，保存 contracts/time.wsdl。Nanonull 为历史候选，本次无法验证，未采用。GreyPhillips 未承诺公共 SLA 或长期免费，不将本功能作为游戏运行前提。
Endpoint https://beta.greyphillips.com/apis/soap/argos/acl.asmx ，namespace http://greyphillips.com/ ，SOAPAction http://greyphillips.com/getDateTime 。使用 GPApiClientLibrary_argosSoap（SOAP 1.1）binding，仅调用无副作用 getDateTime，参数 strFormat=yyyy-MM-ddTHH:mm:sszzz，不调用契约中的其他业务操作。
首次真实返回 2026-11-02T09:26:20-06:00。格式校验必须有 Z 或明确偏移；严格校验年月日时分秒，拒绝无时区、非法日期或超长响应。只依据返回偏移换算 UTC，不猜服务器所在国家或地域。界面转换为北京时间，不宣称这是 NTP 校时或权威标准时间。

## 数据流与 API
Browser → GET /api/time → TimeServiceClient → WSDL 代理 → HTTP SOAP → 外部服务器。
成功 200：success=true，status=fresh，utcTime、sourceTime、source、fetchedAt、ageMs、cached、requestId。
失败且有历史样本：503，success=false，status=stale，code=TIME_UNAVAILABLE，lastSample（保留原采样时间）。失败无历史：503，status=unavailable。不以本机日期替代外部返回。
请求去重：同一进程共享一个在途外呼。成功缓存 60 秒，失败冷却 15 秒；手动刷新也遵循缓存和冷却。每次外呼总时限 5 秒，不自动重试；下一次定时或手动请求重试。限制缓存为单一最近样本，不存数据库。健康检查仅返回最近状态，不触发外呼。
日志：requestId、服务、方法、结果和耗时；不返回异常堆栈。真实证据脚本独立输出 XML 和验证时间。

## 界面与交互
服务区新增中英文卡片：北京时间、GreyPhillips SOAP 来源、最后同步年龄、刷新按钮。首次加载、每 60 秒且页面可见时同步；回到页面同步。采用静态采样时间展示（不本地递增，避免误称每秒外部调用），明确显示“最近采样”。失败保留最近采样并标记过期，无历史显示不可用。请求期间禁用刷新，5 秒超时后可重试。外部延迟不阻塞游戏。

## 文件与实施步骤
1. test/time.test.js：先写失败测试；真实本地 SOAP fixture 验证 binding、时区、缓存、并发去重、错误/坏响应、超时与过期样本。
2. src/time.js：实现客户端与严格解析；src/server.js 增加 /api/time、健康与日志。
3. public/time.js、i18n.js、index.html、style.css：独立卡片与双语，避免干扰现有游戏。
4. scripts/time-evidence.js：调用真实接口两次，保存消息并验证时间递增；scripts/time-ui-check.js 检查加载/成功/失败/旧值和双语。
5. 运行完整后端、原 UI、新 UI 测试；只读独立审查并修复；更新 README、验收记录。
6. 确认无用户未提交修改、排除 data/node_modules/缓存；提交并普通 git push origin main，不强推。推送前 fetch 检查远端进展，有冲突先解决并重测。

## 验收
真实 POST 成功且证据齐全；明确时区；60 秒缓存；5 秒上限；并发合并；不可用/过期不伪造；游戏功能回归通过；360px 无溢出；独立记录 DataAccess 状态。此文即实施规范，实际结果见 time-verification.md。
