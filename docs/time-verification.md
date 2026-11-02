# 时间服务验收记录

2026-11-02 / Asia/Shanghai。

- 官方 WSDL 下载成功，固定保存 contracts/time.wsdl（包含供应方完整业务契约，本应用只调用 getDateTime）。
- SOAP 1.1 连续两次真实调用成功，返回带 -06:00 偏移的时间，换算后分别为 2026-11-02T15:30:41.000Z、2026-11-02T15:30:42.000Z，时间递增。
- 接收时本机 UTC 约 15:34:21、15:34:22；供应方时钟约慢 3 分 40 秒。不据此确认哪方是标准时钟，不宣称 NTP 精度。显示服务源、最近采样及北京时间时区。
- 真实 XML：docs/soap-samples/time-1-request.xml / time-1-response.xml、time-2-request.xml / time-2-response.xml。结构化记录 time-verification.json。
- npm test：11 项通过，含时区、非法日期、缓存、并发去重、超时、失败旧样本、64 KiB 响应上限。
- 原 UI 回归通过；新增 time-ui-check：北京时间换算、双语、503 后保留过期样本、360px 无水平溢出通过。UI 成功响应由测试路由提供，独立于真实外呼证据。
- NumberToWords 旧失败记录不被本次时间成功覆盖。
- 独立审查指出超长响应与采样年龄问题，均已修复并验证；时间值保持静态采样，采样年龄随实际经过时间更新。

课堂演示：打开页面时间卡片，点击同步，查看来源与采样年龄；展示 SOAP XML；将 TIME_ENDPOINT 指向 http://127.0.0.1:1/unavailable 后重启演示不可用，游戏仍可运行。新进程没有旧样本，所以显示不可用；同进程曾成功后失效则显示过期。
