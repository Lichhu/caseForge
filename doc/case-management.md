# 准生产管理

入口：项目管理或需求管理下拉菜单 → 准生产管理（`/api-test/preproduction`）。

## 数据来源与同步

准生产管理的案例不是实时读取项目管理中的 `api_test_case`，而是读取同步快照表 `api_preprod_case`。

同步入口在项目管理 → 交易码列表右上角，位于「服管同步」旁边：

- 先校验当前项目对应需求的 `api_requirement.applicationName`，为空时阻止同步并提示去需求管理维护；
- 应用校验通过后，必须至少勾选一条交易码；
- 需求列表编辑已支持维护归属应用，分发人或需求认领人可编辑；
- 预检返回选中交易在 `runnerCaseIds` 中关联的案例，失效关联只计数并跳过；
- 弹窗默认勾选全部启用案例，未启用案例展示但不可勾选；
- 只同步用户在弹窗中勾选的案例，按案例 ID 处理，版本只展示不参与唯一性；
- 同步时归属应用直接取当前需求的 `applicationName`；
- 准生产列表不提供手工修改或批量指定归属应用；
- 已在准生产的案例不可重复同步；如需按源案例内容重建，必须先删除准生产内的该条案例；
- 同步只新增快照或恢复已删除快照，不覆盖仍在准生产侧使用的案例，也不自动删除其他快照；
- 准生产管理的执行使用快照内容，不读取项目管理中源案例的最新修改。

预检接口：`POST /api-test/:projectId/transactions/preprod-sync/preview`。

同步接口：`POST /api-test/:projectId/transactions/preprod-sync`。

上线后历史案例不会自动出现在准生产管理，需要在项目管理中执行一次同步。

## 列表能力

- 汇总当前用户可访问的准生产案例；只保留需求编号、交易码、归属应用三个筛选项。
- 需求与交易联动：选择需求后只展示该需求下的交易码，切换需求会清空交易和归属应用筛选。
- 归属应用筛选项来自当前筛选范围内已同步案例的归属应用。
- 列表展示全部已同步案例，不再提供版本、搜索和「只看最新版本」筛选。
- 列表展示准生产快照创建时间；点击任意一条案例从右侧滑出详情抽屉，通过「基础信息 / 步骤列表」页签切换查看。
- 单条删除在详情抽屉内操作，批量删除在顶部工具栏操作；删除不会影响项目管理中的源案例，再次同步可重新写入。
- 跨页勾选使用 ID 缓存；显式全选只返回轻量标识，不加载请求报文、步骤和断言。
- 导出复用 Excel 模板，一次最多 1000 条；明细接口按每批 100 个 ID 获取。
- 批量导出只需选择设计人；模板中的案例路径逐条使用案例当前归属应用并固定追加 `/接口案例`，例如 `/手机银行/接口案例`。

## 执行与报告

- 详情抽屉左下角的「运行推送」执行当前案例的完整步骤列表，并推送单案例结果到测管。
- 列表「批量执行」按选择顺序逐案例执行完整步骤列表；当前案例完成「执行 + 推送」后才处理下一条。
- 「准生产案例列表」后提供「执行推送集」页签；每次单条或批量运行都会创建一个集合。
- 执行推送集可独立创建：在「执行推送集」页签点「新建推送集」填写名称、版本、应用和轮次，集合初始为「待执行」。
- 「准生产案例列表」勾选案例后点「关联到执行推送集」，可把案例编组进已有集合；关联只做编组，不会立即执行。
- 集合详情展示已关联的案例清单，可把案例「移出」集合；移出不影响已产生的执行记录。
- 集合行的「执行」按钮按成员顺序逐条执行并推送测管，复用集合自身记录的版本/应用/轮次。
- 集合行的「删除」按钮可删除推送集：集合与成员关系标记删除，已产生的执行记录保留，需求进度视图仍能看到准生产执行结果。
- 执行中的集合不能删除，需等待执行完成。
- 执行推送集展示名称、版本、应用、轮次、案例进度、执行通过/未通过/异常数量及测管推送成功/失败数量；点击集合可查看集合内每个案例的失败步骤和推送结果。
- 单条与批量共用 `POST /api-test/:projectId/preproduction/cases/:caseId/run-push`，前端批量只是逐条调用该接口。
- 每个案例生成独立 HTML 报告，上传测管平台，并调用测管结果接收接口回传结果。
- 列表「执行 / 推送记录」展示最近一次执行状态、卡住的步骤和测管推送状态；点击「记录」可查看最近 30 次记录。
- 执行前配置错误也会保存记录，例如未配置步骤环境地址时会记录具体步骤和执行错误。
- 通知入队不代表已送达；实际推送由通知队列重试处理。OCU 关闭或接收人为 system 时，界面显示未推送。
- 测管推送失败可单独重试，不会重新执行案例。
- 批量编排在前端，执行期间需要保留页面，非离线后台作业。

执行集保存于 `api_preprod_run_set`，案例记录保存于 `api_preprod_run_record`。案例记录包含执行状态、当前/失败步骤、执行错误、执行 ID、报告地址、推送状态、推送错误、所属执行集以及测管版本/应用/轮次。

相关接口：

- `POST /api-test/:projectId/preproduction/cases/:caseId/run-push`
- `POST /api-test/:projectId/preproduction/run-records/:recordId/retry-push`
- `GET /api-test/:projectId/preproduction/cases/:caseId/run-records`
- `POST /api-test/case-management/run-records/latest`
- `POST /api-test/:projectId/preproduction/run-sets`
- `GET /api-test/:projectId/preproduction/run-sets`
- `GET /api-test/:projectId/preproduction/run-sets/:runSetId/records`
- `POST /api-test/:projectId/preproduction/run-sets/:runSetId/finish`
- `POST /api-test/:projectId/preproduction/run-sets/:runSetId/cases`
- `GET /api-test/:projectId/preproduction/run-sets/:runSetId/cases`
- `DELETE /api-test/:projectId/preproduction/run-sets/:runSetId/cases/:caseId`
- `DELETE /api-test/:projectId/preproduction/run-sets/:runSetId`

## 配置与边界

复用现有测管平台、OCU 和通知队列配置。新增 `api_preprod_case`、`api_preprod_run_set`、`api_preprod_run_set_case`、`api_preprod_run_record` 表及查询索引：

- `idx_api_preprod_project_tx`
- `idx_api_preprod_user_updated`
- `idx_api_preprod_run_user_created`
- `idx_api_preprod_run_case_created`
- `uk_api_preprod_run_set_case`
- `idx_api_preprod_run_set_case_set_sort`
- `idx_api_preprod_run_set_user_created`

部署后应确认表创建成功，并在真实 MySQL 数据上验证同步和列表查询耗时。

## 验证

- `node apps/web/scripts/test-case-management.cjs`
- `pnpm --filter @case-forge/api test -- --runInBand api-case-management.service.spec.ts api-preproduction-case.service.spec.ts`
- `pnpm --filter @case-forge/api typecheck`
- `pnpm --filter @case-forge/web build`
