# 2048 SOAP Web 服务集成项目实施规范

> **新项目实施补充（2026-11-02）：** 本文件从旧项目复制，以下 Java/Maven/CXF 技术及目录为历史建议。本项目采用 Node.js 24 + node-soap + SQLite + 原生网页，具体契约、生命周期、版本与幂等规则以 [design.md](design.md) 为准。WON 可继续或提交锁定；提交后 FINISHED；重开创建新 ID。原目录中的规范未改。运行与实际验收状态见 [README](../README.md)，外部 NumberToWords 当前 POST 连接重置，未宣称成功。

> 文档版本：1.0  
> 日期：2026-11-02  
> 状态：开发基线  
> 项目：WebService（Java / Maven 空项目）

## 1. 项目概述

本项目实现一个可在浏览器游玩的 2048 网页小游戏，并通过 SOAP Web 服务完成游戏核心操作、排行榜管理和外部数字英文转换。页面作为客户端，Java 后端负责业务协调与 SOAP 服务发布/调用。

### 1.1 项目目标

1. 提供完整可玩的 2048 单人游戏。
2. 以 SOAP Web 服务形式发布游戏操作服务和排行榜服务。
3. 调用公开的 Number Conversion SOAP 服务，将最终分数转换为英文文字。
4. 展示清楚的服务边界、WSDL、SOAP 请求/响应和可运行结果，便于课程报告和课堂演示。

### 1.2 范围

**本期包含：**

- 4×4 棋盘、方向移动、相同数字合并、分数和胜负状态。
- 新游戏、继续游戏、撤销上一步（可作为增强项）。
- SOAP 游戏服务：新建游戏、获取棋盘、执行移动、重置游戏。
- SOAP 排行榜服务：提交成绩、查询 Top N、查询个人最佳（匿名昵称维度）。
- 外部 SOAP Number Conversion：游戏结束后转换分数为英文。
- 响应式中文网页、键盘/触屏方向操作、规则说明及调用状态展示。

**本期不包含：**

- 用户注册、登录、密码、跨设备账号体系。
- 在线实时对战、房间、聊天或排行榜反作弊。
- 依赖公共翻译服务进行中英文界面翻译。界面语言由本地化资源实现；外部服务用于数字英文转换。
- 商业级高可用、集群部署或数据库迁移工具。

### 1.3 作业要求对应关系

| 作业关注点 | 项目实现证据 |
|---|---|
| 至少两个 SOAP Web 服务 | 自建 `GameService`、自建 `LeaderboardService`，均发布 WSDL；另集成外部 Number Conversion SOAP 服务 |
| 每个 Web 服务采用课上方法 | 通过 WSDL 描述契约，以 SOAP/XML over HTTP 调用；报告展示 WSDL、Envelope 和代码 |
| 集成过程与代码 | 展示浏览器→Java 后端→SOAP 服务、后端→外部 SOAP 服务的调用链与关键代码 |
| 成功运行与结果 | 展示游戏过程、分数提交、Top 10、英文分数转换结果 |
| 创新与美化 | 2048 游戏化 UI、最高方块统计、英文读分、排行榜；贡献说明由组员补充 |
| 课堂演示 | 按第 12 节流程控制在 10 分钟左右 |

> 课程老师对“至少两个服务”的计数口径如有特殊解释，以老师要求为准。本方案明确提供两个自建 SOAP 服务，并额外集成一个外部 SOAP 服务。

## 2. 架构设计

### 2.1 逻辑架构

```text
┌─────────────────────────────┐
│ Browser UI                  │
│ HTML / CSS / JavaScript     │
│ 游戏操作、棋盘、榜单、状态提示 │
└──────────────┬──────────────┘
               │ HTTP 页面资源 / JSON 适配接口
┌──────────────▼──────────────┐
│ Java Web 应用                │
│ Spring Boot 页面与 REST 适配层 │
│ SOAP 客户端、配置、异常映射    │
└─────┬─────────────────┬─────┘
      │ SOAP/XML         │ SOAP/XML
┌─────▼──────────┐  ┌───▼─────────────────┐
│ GameService    │  │ LeaderboardService  │
│ 自建 SOAP      │  │ 自建 SOAP           │
│ 游戏状态/规则   │  │ 成绩提交/查询        │
└────────────────┘  └─────────────────────┘
      │
      │ SOAP/XML（出分时调用）
┌─────▼────────────────────────┐
│ Number Conversion (DataAccess)│
│ 外部 SOAP：NumberToWords      │
└──────────────────────────────┘
```

### 2.2 调用原则

- 浏览器不直接调用第三方 SOAP 服务，避免浏览器跨域、暴露后端配置及把 SOAP XML 解析逻辑放入前端。
- 浏览器的 JSON 请求仅作为本项目 UI 适配接口；核心游戏逻辑和排行榜操作必须通过本项目发布的 SOAP 服务完成。
- Java 后端 SOAP 客户端经生成的代理类或符合 WSDL 的 SOAP 客户端调用服务，不以手写字符串拼 SOAP 作为唯一实现。
- 外部 Number Conversion 失败不能阻止游戏继续、成绩提交或榜单查询。
- 游戏状态由 `GameService` 持有；前端棋盘是服务端状态的展示，不自行判定合并结果。

### 2.3 建议技术栈

| 层 | 建议 |
|---|---|
| JDK | JDK 17（开发前确认本机版本；Java 11+ 不内置 JAX-WS，需要 Maven 依赖） |
| 构建 | Maven，保留当前根 `pom.xml` 并将其改造成应用工程配置 |
| Web/UI | Spring Boot MVC + 静态 HTML/CSS/JavaScript；前端可不引入框架 |
| SOAP | Apache CXF JAX-WS 发布端点与客户端，或 Jakarta XML Web Services 兼容实现；统一选定一套，不混用 `javax.*` 与 `jakarta.*` |
| 持久化 | 第一阶段 H2 文件数据库或 SQLite；开发/演示机可持久化，避免内存榜单重启即清空 |
| SOAP 客户端生成 | 对外部 Number Conversion WSDL 使用 Maven CXF codegen 生成代理；保存生成配置，避免提交手改生成文件 |
| 运行方式 | 一个 Spring Boot 应用进程；本地 SOAP 端点独立路径发布，便于展示 WSDL |

> 版本号须在开发启动时按所选 JDK 与依赖兼容性锁定到 `pom.xml`，不得使用动态版本。避免为“最新版”随意升级造成课程环境构建差异。

## 3. 服务清单与服务边界

| 服务 | 类型 | 目标地址（开发默认） | 用途 |
|---|---|---|---|
| GameService | 自建 SOAP | `http://localhost:8080/ws/game?wsdl` | 创建/查询/移动/重置游戏 |
| LeaderboardService | 自建 SOAP | `http://localhost:8080/ws/leaderboard?wsdl` | 提交分数、查榜、查个人最佳 |
| Number Conversion | 外部 SOAP | `https://www.dataaccess.com/webservicesserver/NumberConversion.wso` | 将最终非负整数分数转为英文单词 |

外部 WSDL：[`https://www.dataaccess.com/webservicesserver/NumberConversion.wso?WSDL`](https://www.dataaccess.com/webservicesserver/NumberConversion.wso?WSDL)。公开资料列出 `NumberToWords`、`NumberToDollars` 操作，SOAP 1.1/1.2 均有资料支持；本项目固定采用 WSDL 生成客户端并优先使用 SOAP 1.1 binding。服务是否允许当前网络访问需开发初期实测。参考：[SoapUI 示例服务说明](https://www.soapui.org/docs/getting-started/soap-test/)、[IBM 对 Number Conversion WSDL/操作的说明](https://www.ibm.com/docs/en/wam/wm-api-gateway/11.1.0?topic=cyfsa-creating-soap-api-by-importing-api-from-file)。

## 4. 功能需求

### 4.1 游戏规则

1. 棋盘固定为 4 行 × 4 列，初始有两个值为 2 或 4 的格子。
2. 玩家可向上、下、左、右移动。
3. 每次移动时，同一行/列的非零数字向移动方向压缩；相邻相同数字合并为其两倍。
4. 同一轮内，一个格子最多参与一次合并。例如 `[2,2,2,2]` 向左后为 `[4,4,0,0]`。
5. 新生成的方块只在棋盘变化后出现，通常 90% 为 2、10% 为 4；概率作为服务端配置常量。
6. 分数增加值为本次生成的合并方块之和；分数使用 64 位非负整数。
7. 2048 达成后进入 `WON` 状态，提供“继续游戏”允许玩家继续追求更高分；继续后状态记为 `PLAYING_AFTER_WIN` 或等效状态。
8. 无空格且不存在相邻相同格时进入 `LOST`。
9. 对完全无变化的合法方向输入，不生成新块、不加分，返回 `changed=false`。
10. 服务端负责随机格生成，使用可注入随机数生成器；生产模式随机，测试模式可固定种子。

### 4.2 页面需求

- 标题、规则说明、开始/新游戏按钮。
- 4×4 棋盘，按值显示颜色和数字；无障碍文本包含格子数值。
- 当前分数、历史最高分、最高方块。
- 键盘方向键及 `W/A/S/D` 控制；触屏滑动控制。
- 游戏胜利/失败遮罩和继续/重新开始入口。
- 榜单面板显示名次、昵称、分数、最高方块、提交时间；默认 Top 10。
- 游戏結束时可填写昵称（2–16 字符），提交成绩；同一局重复提交应幂等。
- 最终成绩的英文读法区域，显示加载、成功或暂不可用状态。
- 设置项：音效开关、语言选择（简体中文/English）。语言包在项目本地，不调用翻译 API。
- 网络错误、SOAP 错误、外部服务超时均用用户可理解的提示展示；不得将堆栈或服务器敏感信息暴露在页面。
- 不允许以仅前端模拟结果冒充 SOAP 调用成功。开发/演示界面可加“服务调用日志”折叠区显示服务名、操作、耗时和成功/失败，不显示凭证。

### 4.3 排行榜约束

- 排行榜只接收 `WON` 或 `LOST` 的结束局成绩；未结束局不允许提交。
- 以 `gameId` 作为幂等键；同一个 `gameId` 重复提交返回已有记录，不增加重复行。
- 排序顺序：`score DESC`，其次 `reachedTile DESC`，最后 `createdAt ASC`。
- 昵称去首尾空格；空昵称变为“匿名玩家 / Anonymous”；限制 2–16 个 Unicode code point；拒绝控制字符和 HTML 标签，展示时仍做 HTML escaping。
- Top N 的 N 取值 1–50，超出范围返回参数错误。
- 可选：按昵称查询个人最佳，仅作展示，不作为身份认证。
- 数据库写入须事务化；时间统一存 UTC，在 UI 按本地时区格式化。

## 5. SOAP 契约规范

### 5.1 通用契约约定

- SOAP 1.1、Document/Literal、UTF-8。
- 本服务命名空间：`http://webservice.example.com/2048/game/v1` 与 `http://webservice.example.com/2048/leaderboard/v1`（实施时可改为团队/课程命名空间，但必须在 WSDL 固定并写入报告）。
- 操作使用 request/response 包装元素；字段名采用 lowerCamelCase。
- 每个响应返回 `success`、`errorCode`、`message`（或等价的明确 Fault）；正常业务拒绝与协议级错误应区分。
- SOAP Fault 用于无法解析的请求、内部不可恢复错误；业务验证错误可用结构化结果返回。不可在响应中泄露内部类名、SQL、堆栈、文件路径。
- 每个请求应包含 `requestId`（UUID）用于日志关联；响应也回传。
- 序列化坐标使用 `row=0..3`、`column=0..3`；`board` 明确固定 4 行、每行 4 个整数。
- 所有方法都必须在 WSDL 暴露，并提供可复现的 SOAP 请求/响应样例。

### 5.2 GameService 操作

#### `NewGame`

请求：`NewGameRequest { requestId }`  
响应：`NewGameResponse { success, gameId, board[4][4], score, status, reachedTile, createdAt }`

行为：生成 UUID；初始化棋盘并放置两个初始方块；分数为 0、状态为 `PLAYING`。

#### `GetGame`

请求：`GetGameRequest { requestId, gameId }`  
响应：`GetGameResponse { success, game, errorCode, message }`

错误：找不到游戏时 `GAME_NOT_FOUND`。

#### `Move`

请求：`MoveRequest { requestId, gameId, direction }`，`direction ∈ UP|DOWN|LEFT|RIGHT`。  
响应：

```text
MoveResponse {
  success, requestId, gameId,
  board[4][4], score, scoreDelta, status, reachedTile,
  changed, spawnedTile { row, column, value }?,
  mergedTiles [{ row, column, value }]?,
  errorCode, message
}
```

行为：只允许活动中的游戏移动；先滑动合并，再判定是否变化；变化时增加分数、随机生成新方块，最后计算胜负状态。请求方向无效返回 `INVALID_DIRECTION`；游戏结束后禁止普通移动，返回 `GAME_NOT_ACTIVE`。同一 `gameId` 的并发移动必须串行化或做版本校验，避免丢更新。

#### `ContinueAfterWin`

请求：`ContinueAfterWinRequest { requestId, gameId }`  
响应：当前游戏快照。

行为：仅当 `status=WON` 时将游戏转为可继续状态；其他状态返回 `INVALID_GAME_STATE`。该操作不改棋盘与分数。

#### `ResetGame`

请求：`ResetGameRequest { requestId, gameId }`  
响应：新棋盘和重置后游戏快照。

行为：保留或重新生成 gameId 必须统一；建议重新生成新的 gameId，旧局仍保留为历史局但不得重复提交；返回 `previousGameId` 与新 `gameId`。

### 5.3 LeaderboardService 操作

#### `SubmitScore`

请求：`SubmitScoreRequest { requestId, gameId, nickname, score, reachedTile, gameStatus, finishedAt }`。  
响应：`SubmitScoreResponse { success, leaderboardEntry, duplicate, rank?, errorCode, message }`。

行為：校驗遊戲狀態及字段；同一 gameId 幂等；保存成功后计算当前名次。**重要：**客户端提供的 score/reachedTile 不可信。服务应在服务端校验 gameId 对应的游戏快照，使用服务端记录中的分数、最大方块和状态保存。建议排行榜服务通过内部 `GameRepository`/领域服务读游戏终局数据；不可只相信 SOAP 请求字段。

#### `GetTopScores`

请求：`GetTopScoresRequest { requestId, limit }`。  
响应：`GetTopScoresResponse { success, entries[], errorCode, message }`。

行为：按 4.3 规则排序返回 1–50 条。

#### `GetBestScoreByNickname`（建议实现）

请求：`GetBestScoreByNicknameRequest { requestId, nickname }`。  
响应：`GetBestScoreByNicknameResponse { success, entry?, rank?, errorCode, message }`。

行为：按规范化昵称返回个人最佳记录和当前名次；昵称不作为用户认证凭据。

### 5.4 外部 Number Conversion 客户端

- WSDL：`https://www.dataaccess.com/webservicesserver/NumberConversion.wso?WSDL`
- Endpoint：`https://www.dataaccess.com/webservicesserver/NumberConversion.wso`
- Operation：`NumberToWords(ubiNum: unsignedLong) -> words: string`
- Namespace：`http://www.dataaccess.com/webservicesserver/`
- 输入只接受 0 或正整数；超过 WSDL `unsignedLong` 上界或转换异常时显示不可用状态。
- 在游戏结束且终局记录已获得时调用一次；页面刷新可使用本地当前局缓存结果，避免重复外呼。
- 应用设置连接超时 3 秒、读取超时 5 秒；失败最多重试一次，仅对连接错误/超时重试，避免延迟课堂演示。
- 结果缓存键为分数值，缓存有效期 24 小时；缓存可为本地内存，不把其当作持久业务数据。
- 未取得有效返回时显示：`英文分数暂不可用，请稍后重试`（英文 UI 对应本地文案），不得伪造翻译结果。
- 对外部服务的可用性检查应独立提供健康状态；健康检查不可在每次页面请求时阻塞游戏操作。

### 5.5 SOAP 消息样例

#### Move 请求示意

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:g="http://webservice.example.com/2048/game/v1">
  <soapenv:Header/>
  <soapenv:Body>
    <g:MoveRequest>
      <g:requestId>f9e52f67-6417-4c0e-9d95-40b9895fc19a</g:requestId>
      <g:gameId>3e841c78-cc7f-4536-b291-6019cd3e4ed4</g:gameId>
      <g:direction>LEFT</g:direction>
    </g:MoveRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

#### NumberToWords 请求示意

SOAPAction 与响应元素必须以实际下载的 WSDL 为准；使用生成代理能避免错误猜测。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <NumberToWords xmlns="http://www.dataaccess.com/webservicesserver/">
      <ubiNum>2048</ubiNum>
    </NumberToWords>
  </soap:Body>
</soap:Envelope>
```

## 6. 页面与适配接口

浏览器到 Java 后端可使用 JSON REST 适配接口，REST 只负责 UI 调用适配；必须在实现文档中说明真正的服务集成通过 SOAP 客户端/服务完成。

| 方法 | 路径 | 用途 | 对应 SOAP 操作 |
|---|---|---|---|
| `POST` | `/api/games` | 开始游戏 | `NewGame` |
| `GET` | `/api/games/{gameId}` | 获取游戏 | `GetGame` |
| `POST` | `/api/games/{gameId}/moves` | 执行方向移动 | `Move` |
| `POST` | `/api/games/{gameId}/continue` | 胜利后继续 | `ContinueAfterWin` |
| `POST` | `/api/games/{gameId}/reset` | 重开 | `ResetGame` |
| `POST` | `/api/games/{gameId}/score` | 提交终局成绩 | `SubmitScore` |
| `GET` | `/api/leaderboard?limit=10` | Top N 榜单 | `GetTopScores` |
| `GET` | `/api/leaderboard/best?nickname=...` | 查询个人最佳 | `GetBestScoreByNickname` |
| `GET` | `/api/scores/{score}/words` | 获取英文分数 | 外部 `NumberToWords` |
| `GET` | `/api/health` | 本地应用与依赖状态 | 不触发阻塞外呼 |

### 6.1 错误响应约定

REST 适配层统一返回：

```json
{
  "success": false,
  "code": "GAME_NOT_FOUND",
  "message": "找不到这局游戏，请开始新游戏。",
  "requestId": "uuid"
}
```

SOAP Fault/错误码到 HTTP 的映射需一致：参数错误 400、资源不存在 404、状态冲突 409、外部服务不可用 503、本地内部错误 500。对外部 Number Conversion 的 503 不改变游戏 API 的成功结果。

## 7. 数据模型

### 7.1 Game

| 字段 | 类型 | 说明 |
|---|---|---|
| `gameId` | UUID | 主键 |
| `board` | 16 × int | 0 代表空格，其他为 2 的幂 |
| `score` | long | 当前总分 |
| `status` | enum | `PLAYING`、`WON`、`PLAYING_AFTER_WIN`、`LOST` |
| `reachedTile` | int | 曾达到的最大格值 |
| `version` | long | 并发乐观锁版本 |
| `createdAt` / `updatedAt` | Instant | UTC 时间 |
| `finishedAt` | Instant nullable | 终局时间 |

### 7.2 LeaderboardEntry

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID/自增 ID | 记录主键 |
| `gameId` | UUID unique | 幂等唯一键 |
| `nickname` | varchar(64) | 规范化昵称 |
| `score` | long | 从服务端游戏记录复制 |
| `reachedTile` | int | 从服务端游戏记录复制 |
| `createdAt` | Instant | UTC 提交时间 |

## 8. 非功能要求

- **可维护性：**游戏规则、SOAP DTO/端点、排行榜存储、第三方客户端、页面代码分层；禁止将全部逻辑堆入一个 Controller/Endpoint 类。
- **可观测性：**记录 requestId、服务名、操作名、耗时、结果类型；不得记录敏感凭证。开发模式可记录 SOAP 报文摘要；演示证据应脱敏。
- **超时：**所有外部网络调用必须有连接/读取超时，不能无限等待。
- **可靠性：**第三方服务失败不影响游戏、排行榜本地功能；SOAP 服务启动失败则应用应明确失败，避免假装集成成功。
- **安全性：**限制输入长度和值域；昵称输出编码；关闭不安全 XML 外部实体解析（XXE）；生产日志避免完整用户输入；不暴露调试堆栈。
- **性能：**本地移动调用目标 < 500 ms（本机演示）；榜单查询目标 < 500 ms；外部英文转换独立显示加载态，不阻塞棋盘交互以外的后续操作。
- **兼容性：**桌面 Chrome/Edge 当前稳定版；至少支持 360px 手机宽度。
- **配置：**端口、WSDL endpoint、超时、数据库 URL、随机种子/演示模式通过配置注入，不硬编码在业务类。

## 9. 项目目录建议

```text
src/main/java/.../
  config/                 # Spring、CXF、数据库配置
  game/domain/            # 2048 规则、Game、状态
  game/service/           # 游戏用例与 SOAP endpoint
  leaderboard/domain/     # 排行榜模型和规则
  leaderboard/service/    # 排行榜用例与 SOAP endpoint
  soap/contract/game/     # GameService SEI、DTO
  soap/contract/leaderboard/
  integration/numberwords/ # 外部生成代理封装、超时和缓存
  web/controller/         # JSON UI 适配接口
  web/dto/                # 前端请求/响应 DTO
  persistence/            # Repository、实体映射
src/main/resources/
  application.yml
  static/index.html
  static/css/
  static/js/
  db/migration/
src/test/java/.../
docs/
  2048-soap-integration-spec.md
  soap-samples/
```

包名由开发者按项目组织确定，契约命名空间一旦发布不要随意改变。

## 10. 主要异常与边界情况

| 场景 | 预期处理 |
|---|---|
| 不存在的 gameId | `GAME_NOT_FOUND`，页面提示重开游戏 |
| 移动方向为空或不支持 | `INVALID_DIRECTION`，棋盘保持不变 |
| 已结束游戏继续移动 | `GAME_NOT_ACTIVE`，提供重开/胜利后继续入口 |
| 无变化的移动 | `changed=false`，不生成新块、不改变分数 |
| 同一局重复提交成绩 | 返回原榜单记录并标记 `duplicate=true` |
| 恶意或超长昵称 | 参数校验失败；不得写库或反射到页面 HTML |
| limit=0 或 >50 | `INVALID_LIMIT` |
| 游戏移动并发冲突 | 通过版本号拒绝过期请求并返回最新快照/409 |
| Number Conversion 超时/故障 | 英文读分展示不可用状态；其他功能继续 |
| 数据库不可用 | 游戏在内存中可否继续由实现明确；排行榜明确错误，不伪造成功；建议演示启动前检查数据库 |
| WSDL 不可访问 | 构建/启动阶段暴露明确错误；可使用本地保存的 WSDL 生成代理，但运行调用仍需真实服务端点 |

## 11. 开发阶段与交付物

### 阶段 A：项目基线

- 确认 JDK/Maven 版本和项目运行命令。
- 将当前 Maven archetype 骨架整理成实际应用模块。
- 锁定依赖版本、配置本地 profile、建立统一错误响应与日志。
- 交付：可启动空应用、依赖清单、架构图。

### 阶段 B：2048 域逻辑与游戏 SOAP

- 实现纯领域逻辑：移动、合并、分数、胜负、随机块生成。
- 为 GameService 建立 WSDL 契约并发布端点。
- 通过 SOAP 客户端或 SoapUI 验证每个操作；保存请求/响应样例。
- 交付：可访问 WSDL、SOAP 调用证据、规则实现。

### 阶段 C：排行榜 SOAP 与持久化

- 建表和 Repository；实现幂等提交、Top N 排序、个人最佳查询。
- 强制以服务端 Game 终局记录为成绩来源。
- 交付：WSDL、持久化记录和 SOAP 样例。

### 阶段 D：外部 Number Conversion

- 从 WSDL 生成 Java 代理并隔离在 `integration/numberwords`。
- 验证 `NumberToWords(2048)` 等正数调用；核对实际 SOAPAction/响应 XML。
- 增加超时、重试、缓存、降级文案。
- 交付：外部服务契约来源、实际请求/响应截图或脱敏日志。

### 阶段 E：网页和联调

- 实现棋盘、键盘/触屏、分数、胜负、榜单、昵称提交、语言切换。
- 所有游戏变更经 Java 后端调用 GameService；榜单操作经 LeaderboardService。
- 交付：可演示网页、截图、端到端调用日志。

### 阶段 F：验收、报告和演示

- 按第 13 节验收清单逐项留证。
- 报告包含 SOAP 消息、集成步骤/代码、运行结果、创新点、贡献表。
- 准备 10 分钟演示和网络故障备用说明。

## 12. 10 分钟演示建议

| 时间 | 内容 |
|---|---|
| 0:00–0:45 | 项目目标、系统架构、服务清单 |
| 0:45–2:00 | 展示两个自建 WSDL、外部 WSDL、服务操作 |
| 2:00–4:30 | 实际游玩 2048，展示 SOAP Move 调用后棋盘和分数更新 |
| 4:30–6:00 | 结束一局/使用准备好的已结束局，提交成绩并展示榜单；说明 gameId 幂等 |
| 6:00–7:00 | 展示 NumberToWords 请求/响应及英文分数展示 |
| 7:00–8:30 | 展示关键代码层次与错误降级（可断开外部服务做演示，确保游戏仍运行） |
| 8:30–9:30 | 运行结果、创新点、组员贡献 |
| 9:30–10:00 | 总结和提问 |

演示前准备：预热网络外呼；准备可用榜单记录和一局结束状态；如现场网络不可用，可展示已保存的脱敏 SOAP 请求/响应作为外部服务备用证据，但不得声称现场请求成功。

## 13. 验收标准

### 13.1 功能验收

- [ ] 新游戏产生 4×4 棋盘和两个初始块。
- [ ] 四个方向移动正确，空格压缩和合并符合 2048 规则。
- [ ] 一次移动同一目标块不重复合并；无效移动不生成块。
- [ ] 分数增量准确，胜利/失败状态判断正确，胜利可继续。
- [ ] 刷新后当前局可恢复，或产品明确说明不支持恢复（推荐支持）。
- [ ] 终局昵称提交成功，刷新/重复提交不产生重复记录。
- [ ] Top 10 排序正确、刷新后数据仍存在。
- [ ] 英文读分成功显示 Number Conversion 服务返回文本；服务不可用时其他游戏功能照常工作。
- [ ] 中英文 UI 可切换且不依赖翻译服务。
- [ ] 页面可由键盘操作，手机窄屏布局可用。

### 13.2 SOAP/集成验收

- [ ] `GameService` 和 `LeaderboardService` 的 WSDL 可在本机访问。
- [ ] SoapUI 可分别导入两个本地 WSDL 并调用操作。
- [ ] 至少保存一组 GameService 请求/响应、一组 LeaderboardService 请求/响应。
- [ ] 外部 Number Conversion WSDL 在可联网环境可导入，至少一个真实 SOAP 调用成功，保留脱敏证据。
- [ ] UI 操作确实触发对应 SOAP 操作，调用日志显示服务名/操作/结果/耗时。
- [ ] 第三方失败降级路径可演示；不存在假成功或静态伪造榜单。

### 13.3 文档和报告验收

- [ ] 报告列出服务用途、WSDL、endpoint、操作、命名空间和调用方法。
- [ ] 报告包含 SOAP 请求与响应消息（敏感信息脱敏）。
- [ ] 报告包含集成流程、关键代码截图/代码片段及运行结果截图。
- [ ] 报告说明外部公共服务可用性限制和实际验证日期。
- [ ] 列出组员姓名、负责模块和实际贡献。

## 14. 风险与缓解

| 风险 | 缓解方案 |
|---|---|
| 外部公共服务临时不可达或网络受限 | 超时与降级；提前实测；保存真实脱敏调用证据；不让其阻断游戏和排行榜 |
| SOAP/JAX-WS 与 JDK 版本冲突 | 尽早锁定 JDK 和 CXF/Jakarta 版本；禁止混用 `javax`、`jakarta` API |
| 公共 WSDL 或 endpoint 改动 | 将 WSDL/endpoint 配置化；生成代理可依赖固定 WSDL 文件；运行 endpoint 可覆盖配置 |
| 排行榜被伪造高分 | 服务端从 gameId 查询服务端游戏记录，不信任客户端传入分数；明确匿名课堂项目仍非强反作弊系统 |
| 课堂网络不稳定 | 现场演示本地服务和榜单；外部服务失败路径有真实文案；准备此前真实请求/响应截图 |
| Scope 过大导致无法按期完成 | 核心优先级：Game SOAP → 页面可玩 → Leaderboard SOAP → NumberToWords → 增强动画/音效 |

## 15. 开发优先级

### P0（必须完成）

- 2048 核心规则与 GameService SOAP。
- LeaderboardService SOAP 和持久化提交/Top 10。
- 外部 NumberToWords SOAP 至少一次真实调用。
- 可运行页面、运行截图、SOAP 消息与报告证据。

### P1（建议完成）

- 手机滑动、英文界面、个人最佳、撤销一步、音效开关。
- 调用日志面板、动画、无障碍键盘焦点。

### P2（有余力再做）

- 多难度棋盘、每日种子挑战、分享成绩卡、主题皮肤。

## 16. 参考资料

1. SoapUI：用于学习和测试 SOAP 的 Number Conversion 与 Country Info 示例 WSDL。<https://www.soapui.org/docs/getting-started/soap-test/>
2. IBM WebMethods API Gateway：列出 Number Conversion WSDL 以及 `NumberToDollars`、`NumberToWords` 操作。<https://www.ibm.com/docs/en/wam/wm-api-gateway/11.1.0?topic=cyfsa-creating-soap-api-by-importing-api-file>
3. Jakarta EE Tutorial：JAX-WS 的 SOAP 消息、服务端点与 WSDL 客户端生成流程。<https://jakarta.ee/learn/docs/jakartaee-tutorial/9.1/websvcs/jaxws/jaxws.html>
4. DataAccess Number Conversion WSDL：<https://www.dataaccess.com/webservicesserver/NumberConversion.wso?WSDL>

