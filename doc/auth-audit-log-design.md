# 登录与账号切换审计方案

## 1. 背景

CaseForge 当前已基于统一认证签发本地 JWT，并实现了 SYSTEM 账号代登录。现有日志存在以下问题：

- 普通 SSO 登录成功、退出登录没有独立审计事件。
- 登录、退出和代登录主要写服务日志，无法在数据库按用户、时间、IP 查询。
- 认证路由在用户上下文中间件之前放行，HTTP 访问日志中的 `user` 可能显示为 `system`，不能作为登录审计依据。
- 随着失败登录和代登录增加，单表数据量会持续增长，需要提前处理查询、归档和保留期问题。

本方案目标是提供一套可查询、可导出、可分区、可归档的认证审计体系，同时避免原始日志表拖慢普通业务。

## 2. 范围

第一版记录以下认证事件：

| 事件类型 | 触发点 | 说明 |
| --- | --- | --- |
| `login_success` | SSO 票据校验成功、JWT 签发后 | 记录登录成功的账号和会话 |
| `login_failure` | 票据缺失、应用标识错误、票据失效、认证服务异常 | 尽量记录已知账号；未知账号允许为空 |
| `logout` | 清理 JWT Cookie 前 | 记录退出账号和会话 |
| `impersonation_start` | SYSTEM 切换目标账号成功后 | 记录原始操作人、目标账号、原因、IP |
| `impersonation_exit` | 退出代登录并恢复 SYSTEM 后 | 记录原始操作人、目标账号、IP |

第一版不包含：

- 密码、JWT、Cookie、SSO ticket 等敏感数据。
- 用户行为分析和风控模型。
- 与外部 SIEM 的实时对接。
- 原始日志的在线删除、编辑接口。

## 3. 总体设计

采用“两层数据”：

1. `auth_event_log`：只追加的原始事件表，用于审计追溯和明细查询。
2. `auth_event_daily_stat`：按天汇总的统计表，用于页面卡片和趋势图。

核心原则：

- 原始表不允许更新和物理删除单条记录。
- 明细查询必须指定时间范围。
- 分页使用游标，不使用大偏移量 `OFFSET`。
- 汇总数据不实时扫描原始大表。
- 历史数据按月分区或归档，按保留期删除整个分区。
- 审计页面和接口只对授权管理员开放。

## 4. 原始事件表

表名使用 `auth_event_log`，因为内容不仅包含登录，还包含退出和代登录。

```sql
CREATE TABLE auth_event_log (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL COMMENT '事件发生时间，统一使用 UTC',
  event_type VARCHAR(32) CHARACTER SET ascii NOT NULL,
  user_name VARCHAR(255) NULL COMMENT '登录或操作的目标账号',
  actor_user_name VARCHAR(255) NULL COMMENT '原始操作人，代登录时为 system',
  client_ip VARBINARY(16) NULL COMMENT 'IPv4/IPv6 规范化二进制地址',
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_app VARCHAR(64) CHARACTER SET ascii NULL COMMENT 'SSO、本地 JWT 等来源',
  user_agent VARCHAR(512) NULL,
  failure_code VARCHAR(64) CHARACTER SET ascii NULL,
  reason VARCHAR(200) NULL COMMENT '代登录原因或失败说明摘要',
  metadata JSON NULL COMMENT '扩展字段，不参与索引',
  PRIMARY KEY (occurred_at, id),
  KEY idx_auth_event_user_time (user_name, occurred_at, id),
  KEY idx_auth_event_ip_time (client_ip, occurred_at, id),
  KEY idx_auth_event_type_time (event_type, occurred_at, id),
  KEY idx_auth_event_request (request_id, occurred_at),
  KEY idx_auth_event_session (session_id, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='统一认证与代登录审计原始事件';
```

设计说明：

- `occurred_at` 使用 `DATETIME(3)`，应用统一写 UTC，前端按 Asia/Shanghai 展示。
- 主键使用 `(occurred_at, id)`，与时间分区兼容。
- `user_name` 和 `actor_user_name` 保存快照，不建立到 `sys_user` 的外键。
- `client_ip` 使用 `VARBINARY(16)`；查询展示时通过 `INET6_NTOA` 转为文本。
- `session_id` 对应 JWT 新增的 `jti/sessionId` 声明，用于串联登录和退出。
- `request_id` 用于关联 HTTP 访问日志和后续排障。
- `metadata` 只放少量扩展字段，不把 JSON 字段作为主要过滤条件。
- 不记录原始 ticket、Cookie、Token、密码、请求报文等敏感信息。

## 5. 索引与查询模式

索引根据查询页面实际筛选方式设计，不为任意字段组合建立索引。

| 查询方式 | 使用索引 |
| --- | --- |
| 最近一段时间 | `PRIMARY (occurred_at, id)` |
| 某账号 + 时间 | `idx_auth_event_user_time` |
| 某 IP + 时间 | `idx_auth_event_ip_time` |
| 某事件类型 + 时间 | `idx_auth_event_type_time` |
| 请求链路排查 | `idx_auth_event_request` |
| 某会话完整轨迹 | `idx_auth_event_session` |

查询规则：

- 页面默认查询最近 7 天。
- 单次交互查询最大 31 天。
- 账号和 IP 使用精确查询。
- 不支持无时间范围的 `%关键字%` 全表搜索。
- 需要模糊检索时，只在 1 天或 7 天范围内执行，并明确提示查询成本。
- 按时间倒序读取，时间相同时使用 `id` 作为第二排序字段。

## 6. 游标分页

不使用：

```sql
LIMIT 100000, 50
```

使用基于 `(occurred_at, id)` 的游标：

```sql
SELECT ...
FROM auth_event_log
WHERE occurred_at >= :from
  AND occurred_at < :to
  AND (
    occurred_at < :cursorTime
    OR (occurred_at = :cursorTime AND id < :cursorId)
  )
ORDER BY occurred_at DESC, id DESC
LIMIT :pageSize;
```

接口返回 `nextCursor` 和 `hasMore`，不强制每次计算全量 `COUNT(*)`。

页面页大小默认 50，最大 100。精确总数只允许在较短时间范围内计算；长时间范围使用汇总表或近似统计。

## 7. 日汇总表

`auth_event_daily_stat` 只保存聚合结果，避免页面刷新时扫描原始表。

```sql
CREATE TABLE auth_event_daily_stat (
  stat_date DATE NOT NULL COMMENT 'UTC 日期',
  event_type VARCHAR(32) CHARACTER SET ascii NOT NULL,
  event_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (stat_date, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='认证审计日汇总';
```

汇总任务：

- 每 5 分钟增量聚合当天数据。
- 每日结束后执行一次当天最终聚合。
- 使用 `INSERT ... ON DUPLICATE KEY UPDATE` 保证幂等。
- 页面卡片和趋势图只查汇总表。

第一版不生成“按用户活跃数”等高基数汇总；确有需求时再增加专门统计表，避免汇总表本身变得过大。

## 8. 写入链路

新增统一的 `AuthAuditService.record(event)`，认证流程不再各自拼接日志。

### 8.1 事件采集

| 流程 | 采集内容 |
| --- | --- |
| SSO 回调 | 成功账号、失败原因、appid、IP、User-Agent、请求 ID |
| JWT 签发 | 新会话 ID、签发时间、来源 |
| 退出 | 当前账号、目标/原始操作人、会话 ID |
| 代登录切换 | SYSTEM、目标账号、原因、IP、请求 ID |
| 代登录退出 | SYSTEM、目标账号、IP、请求 ID |

登录失败的账号可能无法确定，因此 `user_name` 允许为空。失败事件使用稳定的 `failure_code`，例如：

- `invalid_app_id`
- `ticket_validate_unavailable`
- `ticket_invalid`
- `invalid_user_name`
- `session_expired`
- `target_user_not_found`

### 8.2 一致性策略

- 普通登录、退出、登录失败：同步写入一条审计记录；写入失败时输出结构化错误日志，但不能影响已经完成的认证结果。
- 代登录切换和退出：审计写入失败时阻止操作，避免发生“已切换但没有审计”的情况。
- 审计写入不与业务事务绑定，避免业务回滚导致审计消失。
- 所有记录写 UTC，数据库和服务器时区不参与业务计算。

### 8.3 请求 ID

增加全局请求 ID 中间件：

- 优先读取上游传入的 `X-Request-Id`。
- 没有时由后端生成 UUID。
- 写入响应头和审计记录。
- 通过请求 ID 可以关联认证事件和 HTTP 访问日志。

## 9. 查询接口

### 9.1 明细

```http
GET /api/v1/auth/audit/events
```

参数：

- `from`：开始时间，必填
- `to`：结束时间，必填
- `eventType`：可选
- `userName`：可选，精确匹配
- `ip`：可选，精确匹配
- `requestId`：可选
- `sessionId`：可选
- `cursor`：可选
- `limit`：默认 50，最大 100

返回：

- `items`
- `nextCursor`
- `hasMore`

### 9.2 汇总

```http
GET /api/v1/auth/audit/summary
```

参数：

- `from`
- `to`

返回每天、每种事件的数量，用于趋势图和顶部统计卡片。

### 9.3 导出

导出采用后台任务：

```http
POST /api/v1/auth/audit/exports
GET  /api/v1/auth/audit/exports/:id
GET  /api/v1/auth/audit/exports/:id/download
```

约束：

- 最大时间范围 31 天。
- 单次最多导出 10 万条。
- 后端按 `(occurred_at, id)` 分批读取并流式生成 CSV/Excel。
- 不允许同步导出整张表。
- CSV 文本字段做公式注入防护。

## 10. 权限控制

- 审计查询和导出仅对 `AUTH_AUDIT_ADMIN_USERS` 中的账号开放，默认 `system`。
- 该配置与 `AUTH_IMPERSONATION_ADMIN_USERS` 分开，避免“能切换账号”自动等于“能查看全部审计”。
- 后端对每个查询和下载接口再次校验，不依赖前端隐藏菜单。
- 暂不提供普通用户查看全量登录日志的能力。
- 不提供手工删除原始事件接口。

## 11. 分区与保留期

第一版可直接采用按月 `RANGE COLUMNS(occurred_at)` 分区，避免数据增长后做大表重组。

```sql
ALTER TABLE auth_event_log
PARTITION BY RANGE COLUMNS (occurred_at) (
  PARTITION p202611 VALUES LESS THAN ('2026-12-01 00:00:00'),
  PARTITION p202612 VALUES LESS THAN ('2027-01-01 00:00:00'),
  PARTITION p_future VALUES LESS THAN (MAXVALUE)
);
```

分区维护：

- 每月自动创建未来 3～6 个月分区。
- 当前使用 `p_future` 作为兜底，新月份通过 `REORGANIZE PARTITION` 拆出。
- 查询必须包含 `occurred_at` 条件，确保触发分区裁剪。
- 单日数据量特别大时，再评估由月分区改为日分区。

保留策略建议：

- 最近 180 天：在线数据库，支持页面查询。
- 180 天至 2 年：归档到独立归档表或对象存储。
- 超过组织规定期限：直接删除整个旧分区。

不要使用大批量 `DELETE` 清理历史数据，避免长事务、Undo 膨胀和主从延迟。

## 12. 页面设计

新增 SYSTEM 管理入口“登录审计”，路由建议为 `/system/auth-audit`。

页面结构：

1. 顶部筛选：时间范围、事件类型、账号、IP、请求 ID。
2. 统计卡片：登录成功、登录失败、退出、代登录次数。
3. 明细表格：时间、事件、账号、原始操作人、IP、结果、原因、请求 ID。
4. 详情抽屉：User-Agent、会话 ID、失败码、metadata。
5. 导出按钮：后台生成，完成后下载。

交互约束：

- 默认最近 7 天。
- 切换筛选后重新从第一页游标开始。
- 表格使用服务端分页，不一次性加载全部数据。
- 刷新页面保留筛选条件，但不保留过期游标。
- 查询无结果时显示明确的空状态，不自动扩大到全量历史。

## 13. 性能目标

- 最近 7 天明细查询 P95 小于 500ms。
- 日汇总查询 P95 小于 300ms。
- 单次交互查询最多扫描 31 天分区。
- 登录审计写入不阻塞普通业务接口。
- 导出不占用登录接口线程，不一次加载全部结果。

## 14. 实施步骤

### 第一阶段：基础审计

1. 新增 `auth_event_log`、`auth_event_daily_stat`。
2. 通过现有 `SchemaPatchService` 幂等建表和补索引。
3. 增加请求 ID 中间件。
4. JWT 增加 `sessionId/jti` 声明。
5. 接入 SSO 成功/失败、退出、代登录切换/退出事件。
6. 增加审计写入单元测试和敏感字段泄露测试。

### 第二阶段：后台查询

1. 增加 SYSTEM 专属查询和汇总接口。
2. 增加游标分页、时间范围校验和权限测试。
3. 增加登录审计页面。
4. 增加详情抽屉和筛选条件。

### 第三阶段：导出与运维

1. 增加异步导出任务。
2. 增加日汇总任务。
3. 增加分区创建和归档任务。
4. 增加慢查询、磁盘使用量和审计写入失败告警。

## 15. 验收标准

- SSO 成功登录后能按账号查到 `login_success`。
- 票据失败能查到 `login_failure` 和稳定失败码。
- 退出登录能查到 `logout`。
- SYSTEM 切换账号能查到原始操作人、目标账号、原因和 IP。
- 非授权账号无法查询、导出或访问页面。
- 超过 31 天的交互查询被拒绝。
- 不使用 `OFFSET` 仍能连续翻页且无重复、漏行。
- 页面统计不扫描原始明细表。
- 历史分区可按保留期删除，不需要大事务 `DELETE`。
- 日志中不存在 JWT、Cookie、ticket、密码等敏感数据。

## 16. 待确认项

- 审计数据保留期限由公司安全或合规要求确定，本方案暂按在线 180 天、归档 2 年设计。
- 是否需要普通用户查看自己的登录记录；第一版仅提供 SYSTEM 管理页面。
- 是否已有集中日志平台可以接收审计事件；如果有，可在数据库审计之外同步一份结构化事件。
- 是否需要失败登录告警和暴力破解检测；可在基础审计稳定后增加规则引擎。
