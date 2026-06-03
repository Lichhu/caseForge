# CaseForge 智能案例生成平台

CaseForge 是一个“需求文档 + 动态提示词”的智能测试案例生成平台 MVP。它包含：

- NestJS API：需求文档结构化、约束指令生成、案例树生成、局部补全、导出。
- Vue 3 工作台：项目管理、Markdown 在线编辑、约束配置、类 XMind 案例树编辑。
- 共享类型包：前后端复用案例树、约束、项目模型。

## 快速启动

```bash
pnpm install
pnpm dev
```

默认地址：

- 前端：http://localhost:33550
- 后端：http://localhost:34550/api/v1
- Swagger：http://localhost:34550/docs

如果没有配置大模型 Key，后端会使用本地规则生成器，便于先完成业务流程联调。配置 `OPENAI_API_KEY` 后，需求结构化和案例生成都会优先调用真实模型；`OPENAI_STRUCTURE_MODEL` 可单独指定结构化模型。

## Monorepo 目录

```text
caseForge/
├─ apps/
│  ├─ api/              # NestJS 后端服务
│  │  ├─ src/           # API、业务服务、AI 生成流程
│  │  ├─ prisma/        # 后续数据库模型
│  │  └─ env/           # 环境变量示例
│  └─ web/              # Vue 3 前端工作台
│     └─ src/           # 页面、组件、状态管理、样式
├─ packages/
│  └─ shared/           # 前后端共享类型与契约
├─ package.json         # 根脚本与 workspace 入口
├─ pnpm-workspace.yaml  # monorepo 包范围
└─ pnpm-lock.yaml       # 依赖锁定
```

这些目录属于运行或构建产物，正常开发时可以忽略：

- `node_modules/`
- `.pnpm-store/`
- `apps/*/node_modules/`
- `apps/*/dist/`
- `packages/*/dist/`
- `apps/api/.data/`
