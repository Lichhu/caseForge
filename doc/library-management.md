# 全局库管理

入口：需求管理页顶部「更多」菜单。

四个库均从右侧 Drawer 打开；库内的新增/编辑表单继续使用弹窗。

## 范围

- 函数库
- 数据库连接
- 步骤库
- 环境库

函数库、数据库连接和环境库不再按项目隔离，统一按当前登录用户隔离；步骤库原本就是用户级。

## 兼容说明

- 历史数据仍保留原 `projectId` 字段，不做物理删除。
- 查询统一使用 `createdBy = 当前用户`。
- 新建全局库记录使用 `global:<userName>` 作为兼容 `projectId`，避免历史唯一索引冲突。
- 执行案例时使用的环境、数据库连接和数据函数都从当前用户的全局库解析。

## 验证

- `pnpm --filter @case-forge/api exec jest --runInBand api-data-function.service.spec.ts api-environment.service.spec.ts sql-step-runner.service.spec.ts api-execution.step-env.spec.ts`
- `pnpm --filter @case-forge/api typecheck`
- `pnpm --filter @case-forge/web typecheck`
- `pnpm --filter @case-forge/web build`
