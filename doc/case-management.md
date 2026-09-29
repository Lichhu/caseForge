# 案例管理

入口：项目管理或需求管理下拉菜单 → 案例管理（`/api-test/cases`）。

- 汇总当前用户可访问的接口测试需求、交易及案例；支持需求编号、交易码、案例名称/编号筛选。
- 只有选择具体交易后才出现版本筛选。默认只看最新版本，按项目和交易分别比较生成版本号，保留该版本全部案例；无版本手工案例保留。选择具体版本会关闭“只看最新版本”。
- 可跨页勾选或选择全部筛选结果，导出复用现有 Excel 模板。
- 批量执行前按需求确认执行环境，逐案例执行、生成独立 HTML 报告、上传 MinIO，并向当前用户入队敏行通知。报告发布失败可单独重试，不重复执行案例。
- 报告 URL 有效期为 7 天。通知入队不代表已送达；实际推送由现有通知队列重试处理。OCU 关闭或接收人为 system 时，界面明确显示未推送。

## 配置与边界

复用现有 MinIO、OCU 和通知队列配置，无新增环境变量或数据库字段。部署需保证 MinIO 桶存在并可写，真实用户名通过现有用户上下文传递；要发送通知需启用已有 OCU 配置。

此版批量编排在前端，执行期间需要保留页面，非离线后台作业。报告上传和通知接口没有整体幂等键，极端网络断连后手动重试发布可能重复入队通知。列表已改为数据库筛选与分页：`GET /api-test/case-management/cases` 接受 page/pageSize、projectId、transactionId、versionCode、keyword、latestOnly，返回 rows/count/page/pageSize；单页上限 100。前端不再遍历所有项目/交易拉取全部案例，也不再使用 slice 分页。

筛选项从独立 options 接口获取，搜索有 300ms 防抖、旧响应失效保护。跨页勾选使用 ID 缓存；显式全选调用 selection 接口仅加载标识、标题和启用状态，不加载报文。导出时才通过 details 接口按每批最多 100 个 ID 获取完整明细。超大规模的全选和 Excel 导出仍消耗与选择数量相关的内存，尚未改为后台流式导出。

新增 `idx_api_case_user_deleted_created`、`idx_api_case_project_user_endpoint` 两个索引，纳入现有启动索引补丁流程；无新增字段。部署后应确认索引创建成功，并在真实 MySQL 数据上验证执行计划与耗时。

这里“推送结果”按现有敏行通知实现，不是回写第三方测试平台业务状态。

## 验证

- `node apps/web/scripts/test-case-management.cjs`
- `pnpm --filter @case-forge/api test -- --runInBand api-case-report-delivery.service.spec.ts`
- `pnpm --filter @case-forge/api typecheck`
- `pnpm --filter @case-forge/web build`

- `pnpm --filter @case-forge/api exec jest --runInBand api-case-management.service.spec.ts`
