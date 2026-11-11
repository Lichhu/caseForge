# CaseForge 外部 Mock 服务

用于在没有真实 HTTP / Socket 下游服务时，仍然可以调试接口测试案例。

它提供两个本地服务：

- HTTP Mock：按 `method + path + query + header + body` 匹配 fixture
- Socket / TCP Mock：按请求报文内容匹配 fixture，支持 `length-prefix` 和 `raw` 两种模式

不修改 CaseForge 核心代码，只需要把环境里的服务地址指向本机 Mock 端口。

> MQ 说明：当前 CaseForge 执行链路只实现了 HTTP 和 TCP，MQ 还没有真正的发送/消费执行。即使起一个 MQ broker，也无法直接跑 MQ 案例。MQ 需要先补执行适配，或者把消息发送/消费拆成 HTTP/SQL 步骤验证。

## 快速开始

```bash
# 1. 可选：复制一份本地配置（不改也可以，默认读取 example）
cp apps/api/scripts/mock-services/mock.config.example.json \
   apps/api/scripts/mock-services/mock.config.json

# 2. 同时启动 HTTP + Socket Mock
pnpm --filter @case-forge/api mock:services
```

也可以只启动其中一个：

```bash
pnpm --filter @case-forge/api mock:http
pnpm --filter @case-forge/api mock:tcp
```

默认端口：

| 服务   | 地址                     | 编码  |
| ------ | ------------------------ | ----- |
| HTTP   | `http://127.0.0.1:18080` | UTF-8 |
| Socket | `127.0.0.1:16030`        | GBK   |

修改 fixture 文件后不需要重启，下一次请求会重新读取。修改端口、编码、分帧配置需要重启。

## 接入 CaseForge

### HTTP

在 CaseForge 的环境维护里，把服务地址改成：

```text
http://127.0.0.1:18080
```

案例请求路径保持原样，例如 `/txn/demo`，调试时会打到本地 Mock。

### Socket / TCP

把环境服务地址改成：

```text
127.0.0.1:16030
```

并确保案例里的编码、分帧配置与 Mock 配置一致：

```json
{
  "requestFraming": { "type": "length-prefix", "width": 4 },
  "responseFraming": { "type": "length-prefix", "width": 4 },
  "encoding": "GBK"
}
```

重点：

- **响应前缀宽度必须和案例的 `framing.width` 一致**，否则 CaseForge 会等到超时。
- 案例配置的是 8 字节前缀，就把 `requestFraming.width` 和 `responseFraming.width` 都改成 8。
- 如果案例不分帧，把 `requestFraming` 设为 `null`，响应默认也会走 raw；也可以单独设置 `responseFraming: null`。
- 编码必须和案例一致。银行类接口通常是 GBK，不是 UTF-8。

## fixture 格式

HTTP 和 Socket 共用一套 fixture 结构，按文件名排序，**第一条匹配的生效**。更具体的匹配条件放在前面，兜底配置放在最后。

```json
{
  "name": "fixture 名称（日志和调试接口会显示）",
  "description": "可选说明",
  "match": {
    "method": "POST",
    "path": "/txn/demo",
    "pathPrefix": "/txn/",
    "query": { "type": "1" },
    "headers": { "x-channel": "app" },
    "bodyIncludes": "enterOnline005",
    "bodyRegex": "resCode>000000<"
  },
  "response": {
    "status": 200,
    "headers": { "Content-Type": "application/json; charset=utf-8" },
    "body": { "resCode": "000000", "resText": "交易成功" },
    "delayMs": 0,
    "encoding": "GBK",
    "framing": { "type": "length-prefix", "width": 4 },
    "close": false
  }
}
```

匹配规则：

- `match` 省略表示匹配所有请求（兜底）。
- 所有列出的条件之间是 AND 关系。
- `path` 是精确匹配，`pathPrefix` 是前缀匹配。
- `headers` 的 key 不区分大小写。
- `bodyIncludes` 是字符串包含，`bodyRegex` 是正则，两者可以同时使用。
- HTTP 的 `status` 默认 200；Socket 没有 HTTP 状态码，`status` 会被忽略。
- HTTP 的 `body` 是对象时自动 JSON 序列化；字符串时原样返回。
- Socket 的 `body` 建议是字符串；对象会自动 JSON 序列化。
- `response.encoding` 默认继承服务配置。
- `response.framing` 省略时继承 TCP 的 `responseFraming`；设为 `null` 表示响应不加长度前缀。
- `response.close` 省略时使用 TCP 的 `closeAfterResponse`。

示例文件：

- `fixtures/http/01-error.json`：同一路径下先匹配包含 `CIC024` 的请求
- `fixtures/http/02-success.json`：兜底成功响应
- `fixtures/socket/01-success.json`：匹配 `enterOnline005`
- `fixtures/socket/02-error.json`：匹配 `QryZxReportId`

## 调试和验证

启动后可以直接用 curl 验证 HTTP：

```bash
curl -s -X POST http://127.0.0.1:18080/txn/demo \
  -H 'Content-Type: application/json' \
  -d '{"resCode":"000000"}'
```

Socket 建议直接在 CaseForge 里点“调试”，观察：

1. 响应报文是否是 fixture 里的 XML
2. 变量提取是否成功
3. 断言是否符合预期
4. 导出 HTML / Excel 报告时，“返回码 / 返回信息”是否显示 `resCode` / `resText`

如果报告里显示的是 fixture 中的：

```text
返回码：000000
返回信息：交易成功
```

说明链路已经通了。

## 调试接口

- `GET http://127.0.0.1:18080/_mock/health`：服务状态和 fixture 数量
- `GET http://127.0.0.1:18080/_mock/fixtures`：当前加载的 fixture 列表和匹配条件

Socket 没有 HTTP 调试接口，匹配结果看终端日志。

## 常见问题

### TCP 已连接但未收到响应

优先检查：

1. `requestFraming.width` 是否和案例的 `framing.width` 一致
2. `encoding` 是否和案例一致（GBK / UTF-8）
3. 响应 `framing.width` 是否和请求一致

### 未匹配到 fixture

终端日志会打印请求报文预览和当前可用 fixture。根据预览调整 `bodyIncludes` 或 `bodyRegex`。

HTTP 未匹配会返回 404 JSON；TCP 未匹配会返回一段 `<MockServerError>` 并关闭连接，便于在响应快照里直接看到原因。

### 中文乱码

确认案例编码、Mock 的 `encoding`、fixture 的 `response.encoding` 三者一致。银行 Socket 报文通常是 GBK。

### 端口被占用

修改 `mock.config.json` 里的 `port`，或者用命令行覆盖：

```bash
pnpm --filter @case-forge/api mock:http -- --port=18081
pnpm --filter @case-forge/api mock:tcp -- --port=16031
```

## 注意

- 默认只监听 `127.0.0.1`，不要随意改成 `0.0.0.0` 暴露到局域网。
- 外部 Mock 对 CaseForge 来说就是“真实响应”，报告不会自动标记“模拟”。建议单独建一个名为“本地 Mock”的环境，不要用它生成发布质量结论。
- fixture 应该来自接口文档、真实响应或评审过的测试数据，不要根据断言反推生成，否则测试会失去意义。
