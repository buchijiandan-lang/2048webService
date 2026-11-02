# 实施决策（2026-11-02）

此文优先于交接规范中冲突的建议。原项目保持不变，复制的规范保留追溯用途。

采用 Node.js 24、node-soap、Express、内置 SQLite 和原生网页。比较过 Java/CXF（代码生成成熟，但部署较重）和 Python SOAP（需额外运行时），选择现有 Node 环境。node-soap 从固定 WSDL 动态生成代理，非手拼 XML 客户端；运行时真实 HTTP SOAP。两个自建服务加一个外部服务，不声称符合两个外部服务的口径。

JSON adapter → WSDL client → HTTP /ws/game 或 /ws/leaderboard → 领域逻辑 → SQLite。排行榜在同一事务内读取服务端游戏快照，不信任上报分数。外部 NumberToWords 使用下载保存的官方 WSDL 和 SOAP 1.1 binding。

## 一致规则

- 初始两个块，90% 为 2。4×4，单次合并一次；无变化不生成块、不增版本。
- WON 为暂停决策点：继续进入 PLAYING_AFTER_WIN；或提交后变成 FINISHED。LOST 提交也进入 FINISHED。提交后不可继续，避免榜单与继续游戏分数矛盾。
- ResetGame 创建新 ID，旧局变为 ABANDONED（已 FINISHED 保留）。放弃局不可提交。
- Move、ContinueAfterWin、ResetGame、SubmitScore 必须带 expectedVersion；冲突返回 VERSION_CONFLICT。每次写请求携带 UUID requestId，事务中持久化操作、参数指纹及响应；同 ID 同参数重放原结果，不同参数拒绝。提交另以 gameId 唯一约束幂等。
- 游戏、请求记录、榜单同库持久化，不自动过期；浏览器 localStorage 保存当前 gameId，刷新/重启恢复。数据库故障操作失败，不回退内存伪成功。单进程同步事务串行写入；不承诺多实例集群。
- score 对外用十进制字符串，内部 BigInt，范围 0..9223372036854775807，避免 JS 整数精度损失；board 使用 16 个 row-major cell，WSDL 固定 16 项，是原二维数组的明确等价格式。
- UTC 时间；昵称 NFC、trim、2–16 Unicode code points，空值 Anonymous，拒绝控制字符及尖括号；按 score、reachedTile、createdAt、id 排序。
- NumberToWords 缓存 24 小时；网络失败最多一次重试。采用每次请求总时限 5 秒（可配置），覆盖连接及读取，替代旧建议中分离的连接 3 秒/读取 5 秒；最多约 10 秒即降级。健康检查只显示最近结果，不发外呼。英文不可用独立于游戏状态。不会伪造英文。
- 仅本机课堂应用，默认 loopback，匿名 gameId 是访问凭据，无账户体系。拒绝 DTD/ENTITY，限制请求体；不开放 CORS。音效/撤销不在本次核心交付。

## 文件边界

src/domain.js 纯规则；src/store.js SQLite、生命周期和幂等；contracts/*.wsdl 类型契约；src/soap.js 发布与代理；src/words.js 外部调用；src/server.js JSON 适配和启动；public/ 页面与静态语言；test/ 规则、SOAP 和浏览器集成；scripts/ 证据和演示。

参考：https://github.com/vpulim/node-soap ，https://nodejs.org/docs/latest-v24.x/api/sqlite.html 。依赖精确版本见 package-lock.json。
