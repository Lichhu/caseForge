# API 测试控制器

<cite>
**本文引用的文件**
- [apps/api/src/modules/api-test/controller/api-test.controller.ts](file://apps/api/src/modules/api-test/controller/api-test.controller.ts)
- [apps/api/src/modules/api-test/dto/save-transaction.dto.ts](file://apps/api/src/modules/api-test/dto/save-transaction.dto.ts)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts)
- [apps/api/src/modules/api-test/dto/save-environment.dto.ts](file://apps/api/src/modules/api-test/dto/save-environment.dto.ts)
- [apps/api/src/modules/api-test/dto/execution-platform.dto.ts](file://apps/api/src/modules/api-test/dto/execution-platform.dto.ts)
- [apps/api/src/modules/api-test/dto/save-api-doc.dto.ts](file://apps/api/src/modules/api-test/dto/save-api-doc.dto.ts)
- [apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts](file://apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts)
- [apps/api/src/modules/api-test/dto/list-api-cases.dto.ts](file://apps/api/src/modules/api-test/dto/list-api-cases.dto.ts)
- [apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts](file://apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts)
- [apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts](file://apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts)
- [apps/api/src/modules/api-test/service/api-transaction.service.ts](file://apps/api/src/modules/api-test/service/api-transaction.service.ts)
- [apps/api/src/modules/api-test/service/api-case.service.ts](file://apps/api/src/modules/api-test/service/api-case.service.ts)
- [apps/api/src/modules/api-test/service/api-doc.service.ts](file://apps/api/src/modules/api-test/service/api-doc.service.ts)
- [apps/api/src/modules/api-test/service/api-execution.service.ts](file://apps/api/src/modules/api-test/service/api-execution.service.ts)
- [apps/api/src/modules/api-test/service/api-environment.service.ts](file://apps/api/src/modules/api-test/service/api-environment.service.ts)
- [packages/shared/src/api-test.ts](file://packages/shared/src/api-test.ts)
</cite>

## 更新摘要
**所做更改**
- 更新了调试运行端点的文档，添加了prerequisiteSteps参数的详细说明
- 新增了前置步骤执行的架构说明和执行流程
- 更新了调试执行的流程图，包含前置步骤处理逻辑
- 增强了故障排查指南，包含前置步骤相关的错误处理

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考量](#性能考量)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件面向 API 测试控制器的开发者与使用者，系统性梳理"API 测试"模块的控制器实现与配套 DTO、服务层职责，覆盖以下能力：
- 测试用例管理：创建、更新、删除、列表、生成与运行
- 接口文档导入与结构化：Excel 上传、解析、自动保存与结构化保存
- 环境配置管理：环境与环境服务的增删改查、排序与关联
- 执行集与执行：执行集的维护、替换用例、并发运行；单批用例运行
- 报告导出：按多种格式导出测试报告
- 事务操作：交易码的增删改查与批量删除
- SSL证书验证控制：支持在调试和执行过程中忽略HTTPS证书验证
- **新增功能**：调试执行前置步骤支持，可在主请求执行前自动执行依赖步骤并提取共享变量
- 参数校验与响应处理：基于 DTO 的强类型输入校验与统一响应封装

## 项目结构
API 测试控制器位于 NestJS 模块内，采用"按功能域分层"的组织方式：
- 控制器层：集中暴露 REST API，负责路由映射、参数提取、调用服务层并返回结果
- DTO 层：定义请求体与查询参数的结构与校验规则
- 服务层：封装业务逻辑，协调实体与外部存储（MinIO、数据库）
- 实体层：对应数据库表结构，承载业务数据模型

```mermaid
graph TB
subgraph "控制器层"
C1["ApiTestController<br/>api-test.controller.ts"]
end
subgraph "DTO 层"
D1["save-transaction.dto.ts"]
D2["save-api-case.dto.ts"]
D3["save-environment.dto.ts"]
D4["execution-platform.dto.ts"]
D5["save-api-doc.dto.ts"]
D6["batch-delete-transactions.dto.ts"]
D7["list-api-cases.dto.ts"]
D8["list-api-execution-sets.dto.ts"]
D9["save-api-doc-generation.dto.ts"]
end
subgraph "服务层"
S1["ApiTransactionService"]
S2["ApiCaseService"]
S3["ApiDocService"]
S4["ApiEnvironmentService"]
S5["ApiExecutionSetService"]
S6["ApiExecutionService"]
S7["ApiReportService"]
S8["ApiTransactionService"]
end
C1 --> S1
C1 --> S2
C1 --> S3
C1 --> S4
C1 --> S5
C1 --> S6
C1 --> S7
C1 --> S8
C1 --> D1
C1 --> D2
C1 --> D3
C1 --> D4
C1 --> D5
C1 --> D6
C1 --> D7
C1 --> D8
C1 --> D9
```

图表来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:58-564](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L58-L564)
- [apps/api/src/modules/api-test/dto/save-transaction.dto.ts:1-19](file://apps/api/src/modules/api-test/dto/save-transaction.dto.ts#L1-L19)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts:1-136](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts#L1-L136)
- [apps/api/src/modules/api-test/dto/save-environment.dto.ts:1-50](file://apps/api/src/modules/api-test/dto/save-environment.dto.ts#L1-L50)
- [apps/api/src/modules/api-test/dto/execution-platform.dto.ts:1-148](file://apps/api/src/modules/api-test/dto/execution-platform.dto.ts#L1-L148)
- [apps/api/src/modules/api-test/dto/save-api-doc.dto.ts:1-22](file://apps/api/src/modules/api-test/dto/save-api-doc.dto.ts#L1-L22)
- [apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts:1-11](file://apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts#L1-L11)
- [apps/api/src/modules/api-test/dto/list-api-cases.dto.ts:1-21](file://apps/api/src/modules/api-test/dto/list-api-cases.dto.ts#L1-L21)
- [apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts:1-21](file://apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts#L1-L21)
- [apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts:1-10](file://apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts#L1-L10)

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:58-564](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L58-L564)

## 核心组件
- 控制器：ApiTestController，统一暴露"api-test"标签下的 REST 接口，涵盖交易码、文档、用例、环境、执行集、执行与报告等全链路能力
- DTO：对输入进行强类型约束与校验，确保接口契约清晰、安全
- 服务层：封装业务流程，协调数据库与对象存储，保证幂等与一致性
- 响应封装：通过公共工具函数将内部实体转换为对外公开的响应结构

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:58-564](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L58-L564)
- [apps/api/src/modules/api-test/service/api-transaction.service.ts:21-161](file://apps/api/src/modules/api-test/service/api-transaction.service.ts#L21-L161)
- [apps/api/src/modules/api-test/service/api-case.service.ts:38-200](file://apps/api/src/modules/api-test/service/api-case.service.ts#L38-L200)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:32-200](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L32-L200)

## 架构总览
控制器作为入口，接收 HTTP 请求后：
- 解析路径参数与查询参数（@Param/@Query）
- 解析请求体（@Body），结合 DTO 完成参数校验
- 对于文件上传场景，使用 @UseInterceptors(FileInterceptor) 处理 multipart/form-data
- 调用对应服务层方法执行业务逻辑
- 返回标准化响应或触发下载流式响应

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Ctrl as "ApiTestController"
participant ExecSvc as "ApiExecutionService"
participant EnvSvc as "ApiEnvironmentService"
participant Store as "MinIO/数据库"
Client->>Ctrl : "HTTP 请求"
Ctrl->>Ctrl : "参数解析与 DTO 校验"
alt 需要文件
Ctrl->>Store : "上传文件到 MinIO"
end
Ctrl->>ExecSvc : "调用业务方法"
ExecSvc->>EnvSvc : "获取环境配置"
ExecSvc->>Store : "读写数据库/对象存储"
ExecSvc-->>Ctrl : "返回业务结果"
Ctrl-->>Client : "HTTP 响应/下载流"
```

图表来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:135-166](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L135-L166)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:59-80](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L59-L80)

## 详细组件分析

### 交易码管理（Transactions）
- 列表、新增、更新、删除、批量删除
- 上传状态查询、Excel 文档上传、结构化解析、文档读取与保存、自动生成与保存生成提示、端点列表
- 关键流程：上传文件校验扩展名、转存 MinIO、持久化文档元信息、触发结构化解析、更新项目时间戳

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Ctrl as "ApiTestController"
participant DocSvc as "ApiDocService"
participant TransSvc as "ApiTransactionService"
participant Minio as "MinIO"
participant DB as "数据库"
Client->>Ctrl : "POST /api-test/{projectId}/transactions/{transactionId}/document/upload"
Ctrl->>Ctrl : "校验文件扩展名"
Ctrl->>Minio : "上传文件到对象存储"
Ctrl->>DocSvc : "保存上传文档元信息"
DocSvc->>DB : "写入文档记录"
Ctrl->>DocSvc : "结构化解析"
DocSvc->>Minio : "读取文件内容"
DocSvc->>DocSvc : "提取文本并结构化端点"
DocSvc->>DB : "写入端点与文档状态"
Ctrl-->>Client : "返回文档状态/结构化结果"
```

图表来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:135-189](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L135-L189)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:59-129](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L59-L129)

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:74-189](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L74-L189)
- [apps/api/src/modules/api-test/service/api-transaction.service.ts:32-161](file://apps/api/src/modules/api-test/service/api-transaction.service.ts#L32-L161)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:48-200](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L48-L200)

### 测试用例管理（Cases）
- 列表、创建、更新、删除、生成用例、查询生成状态、取消生成
- 关键流程：校验请求体、解析端点与交易码、生成用例编号、写入数据库、返回公开结构

```mermaid
flowchart TD
Start(["进入创建用例"]) --> Validate["校验 SaveApiCaseDto"]
Validate --> RequireEndpoint["校验端点与交易码"]
RequireEndpoint --> NextNo["生成用例编号"]
NextNo --> Persist["写入用例记录"]
Persist --> Public["封装为公开响应"]
Public --> End(["返回结果"])
```

图表来源
- [apps/api/src/modules/api-test/service/api-case.service.ts:91-141](file://apps/api/src/modules/api-test/service/api-case.service.ts#L91-L141)

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:246-316](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L246-L316)
- [apps/api/src/modules/api-test/service/api-case.service.ts:60-194](file://apps/api/src/modules/api-test/service/api-case.service.ts#L60-L194)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts:19-92](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts#L19-L92)

### 环境配置管理（Environments）
- 环境与环境服务的 CRUD、排序、关联查询
- **新增**：环境服务支持 ignoreSslVerify 配置，允许在特定服务级别控制 HTTPS 证书验证行为
- 关键流程：根据作用域与可见性过滤、支持默认环境标记、服务端地址与传输协议配置

**更新** 环境服务现在支持 SSL 证书验证控制，可通过 `ignoreSslVerify` 字段配置是否在调试和执行过程中忽略 HTTPS 证书验证。

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:318-420](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L318-L420)
- [apps/api/src/modules/api-test/dto/save-environment.dto.ts:10-49](file://apps/api/src/modules/api-test/dto/save-environment.dto.ts#L10-L49)
- [apps/api/src/modules/api-test/dto/execution-platform.dto.ts:12-98](file://apps/api/src/modules/api-test/dto/execution-platform.dto.ts#L12-L98)
- [apps/api/src/modules/api-test/service/api-environment.service.ts:153-163](file://apps/api/src/modules/api-test/service/api-environment.service.ts#L153-L163)

### 执行集与执行（Execution Sets & Runs）
- 执行集的增删改查、替换用例、运行执行集
- 单批用例运行、运行列表与详情查询
- 关键流程：并发度控制、编码格式传递、环境与服务选择

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:422-532](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L422-L532)
- [apps/api/src/modules/api-test/dto/execution-platform.dto.ts:106-147](file://apps/api/src/modules/api-test/dto/execution-platform.dto.ts#L106-L147)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts:107-124](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts#L107-L124)

### 调试执行（Debug Run）
- **新增**：调试执行端点支持 `prerequisiteSteps` 参数，用于在执行主请求前自动执行依赖步骤并提取共享变量
- 支持两种调试模式：基于环境的调试和基于步骤地址的调试
- **增强功能**：前置步骤执行机制，支持变量提取和依赖管理
- 关键流程：参数验证、前置步骤执行、环境变量解析、SSL 验证控制、请求执行、结果持久化

**更新** 调试执行端点现在支持前置步骤功能，可以通过 `prerequisiteSteps` 参数指定在执行主请求前先执行的依赖步骤序列。系统会按顺序执行这些前置步骤，提取其输出的共享变量，然后将其注入到当前调试请求的上下文中，使 ${变量} 占位符能够被正确替换为实际值。

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Ctrl as "ApiTestController"
participant ExecSvc as "ApiExecutionService"
participant EnvSvc as "ApiEnvironmentService"
participant Fetch as "HTTP 客户端"
Client->>Ctrl : "POST /api-test/ : projectId/ : transactionId/cases/debug-run"
Ctrl->>Ctrl : "验证请求参数"
Ctrl->>ExecSvc : "调用 debugRun(prerequisiteSteps)"
ExecSvc->>ExecSvc : "执行前置步骤序列"
loop 遍历 prerequisiteSteps
ExecSvc->>Fetch : "执行前置步骤请求"
Fetch-->>ExecSvc : "返回前置步骤响应"
ExecSvc->>ExecSvc : "提取共享变量"
end
ExecSvc->>ExecSvc : "构建运行时变量上下文"
ExecSvc->>ExecSvc : "替换请求中的变量占位符"
alt 按步骤地址调试
ExecSvc->>EnvSvc : "检查服务级 ignoreSslVerify"
EnvSvc-->>ExecSvc : "返回 SSL 验证配置"
end
ExecSvc->>Fetch : "发送主调试请求可选忽略证书验证"
Fetch-->>ExecSvc : "返回响应"
ExecSvc-->>Ctrl : "返回调试结果"
Ctrl->>Ctrl : "持久化调试记录如指定 caseId"
Ctrl-->>Client : "返回调试结果"
```

图表来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:782-835](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L782-L835)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:709-791](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L709-L791)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:797-849](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L797-L849)
- [apps/api/src/modules/api-test/service/api-environment.service.ts:153-163](file://apps/api/src/modules/api-test/service/api-environment.service.ts#L153-L163)

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:782-835](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L782-L835)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:709-791](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L709-L791)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:797-849](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L797-L849)

### 报告导出（Reports）
- 支持 xlsx、pdf、html 三种格式导出
- 关键流程：根据运行 ID 生成报告内容，设置响应头并输出二进制流

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:543-562](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L543-L562)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts:126-135](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts#L126-L135)

### DTO 使用模式与参数校验
- 强类型与校验：使用 class-validator/class-transformer 确保输入合法
- Swagger 注解：ApiProperty/ApiPropertyOptional 提供 OpenAPI 描述
- 分页查询：ListApiCasesDto 与 ListApiExecutionSetsDto 统一分页参数
- **新增**：环境服务 DTO 支持 ignoreSslVerify 字段，用于配置 SSL 证书验证行为
- **新增**：调试执行支持 prerequisiteSteps 参数，类型为 ApiCaseStep[]，用于指定前置步骤序列

**更新** 调试执行相关 DTO 现在包含 `prerequisiteSteps` 字段，允许在执行主请求前指定要执行的依赖步骤序列。每个步骤都包含目标地址、请求配置、预期响应和变量导出配置。

章节来源
- [apps/api/src/modules/api-test/dto/save-transaction.dto.ts:3-18](file://apps/api/src/modules/api-test/dto/save-transaction.dto.ts#L3-L18)
- [apps/api/src/modules/api-test/dto/save-api-case.dto.ts:19-135](file://apps/api/src/modules/api-test/dto/save-api-case.dto.ts#L19-L135)
- [apps/api/src/modules/api-test/dto/save-environment.dto.ts:10-49](file://apps/api/src/modules/api-test/dto/save-environment.dto.ts#L10-L49)
- [apps/api/src/modules/api-test/dto/execution-platform.dto.ts:12-147](file://apps/api/src/modules/api-test/dto/execution-platform.dto.ts#L12-L147)
- [apps/api/src/modules/api-test/dto/save-api-doc.dto.ts:5-21](file://apps/api/src/modules/api-test/dto/save-api-doc.dto.ts#L5-L21)
- [apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts:4-10](file://apps/api/src/modules/api-test/dto/batch-delete-transactions.dto.ts#L4-L10)
- [apps/api/src/modules/api-test/dto/list-api-cases.dto.ts:6-20](file://apps/api/src/modules/api-test/dto/list-api-cases.dto.ts#L6-L20)
- [apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts:6-20](file://apps/api/src/modules/api-test/dto/list-api-execution-sets.dto.ts#L6-L20)
- [apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts:4-9](file://apps/api/src/modules/api-test/dto/save-api-doc-generation.dto.ts#L4-L9)
- [packages/shared/src/api-test.ts:133-142](file://packages/shared/src/api-test.ts#L133-L142)

### 错误处理策略
- 参数缺失/非法：抛出 BadRequestException
- 资源不存在：抛出 NotFoundException
- 幂等与一致性：通过审计字段与事务性操作保障
- 结构化失败：文档结构化异常时记录错误信息并返回
- **新增**：SSL 证书验证失败的错误处理，包括自签名证书和网络连接问题
- **新增**：前置步骤执行失败的错误处理，包括步骤执行失败和变量提取失败

**更新** 系统现在能够正确处理前置步骤相关的错误，包括步骤执行失败、必填变量提取失败和环境地址未配置等情况，并提供详细的错误信息指导用户修复问题。

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:146-153](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L146-L153)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:68-70](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L68-L70)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:99-103](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L99-L103)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:864-877](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L864-L877)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:804-849](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L804-L849)

## 依赖关系分析
- 控制器依赖多个服务：ApiDocService、ApiCaseService、ApiEnvironmentService、ApiExecutionService、ApiReportService、ApiTransactionService
- 服务间协作：文档服务与 MinIO 协作完成文件存储；用例服务与端点/交易码实体交互；执行服务串联环境与用例
- 外部依赖：MinIO 对象存储、TypeORM 数据库、Node.js fetch API（支持自定义 dispatcher）

```mermaid
classDiagram
class ApiTestController {
+listTransactions()
+createTransaction()
+updateTransaction()
+deleteTransaction()
+batchDeleteTransactions()
+uploadDocument()
+structureDocument()
+getDocument()
+autoSaveDocument()
+saveDocument()
+saveDocumentGeneration()
+listEndpoints()
+listCases()
+createCase()
+updateCase()
+deleteCase()
+generateCases()
+getGenerateStatus()
+cancelGenerate()
+listEnvironments()
+createEnvironment()
+updateEnvironment()
+deleteEnvironment()
+listEnvironmentServices()
+createEnvironmentService()
+updateEnvironmentService()
+reorderEnvironmentService()
+deleteEnvironmentService()
+listExecutionSets()
+createExecutionSet()
+updateExecutionSet()
+deleteExecutionSet()
+replaceExecutionSetCases()
+runExecutionSet()
+runCases()
+debugRunCase()
+listRuns()
+getRun()
+reportSummary()
+exportReport()
}
class ApiDocService
class ApiCaseService
class ApiTransactionService
class ApiEnvironmentService
class ApiExecutionSetService
class ApiExecutionService
class ApiReportService
ApiTestController --> ApiDocService
ApiTestController --> ApiCaseService
ApiTestController --> ApiTransactionService
ApiTestController --> ApiEnvironmentService
ApiTestController --> ApiExecutionSetService
ApiTestController --> ApiExecutionService
ApiTestController --> ApiReportService
```

图表来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:61-72](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L61-L72)

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:61-72](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L61-L72)

## 性能考量
- 文件上传：建议限制文件大小、启用流式处理与超时控制
- 结构化解析：大文档解析可能耗时，建议异步化与进度反馈
- 查询分页：合理设置分页大小，避免一次性加载过多数据
- 并发执行：执行集运行时注意并发度与资源占用，避免阻塞
- 缓存与去重：对重复上传与结构化结果进行缓存与去重判断
- **新增**：SSL 连接池优化：系统复用跳过证书校验的 undici Agent，避免每次请求重建连接池
- **新增**：前置步骤执行优化：按序执行前置步骤，避免不必要的网络请求和资源消耗

**更新** 系统实现了前置步骤执行的优化机制，确保前置步骤按顺序执行，并在提取共享变量后立即释放资源，避免内存泄漏和连接池耗尽。

## 故障排查指南
- 上传失败
  - 现象：返回"请选择接口文档文件"或"仅支持 xls、xlsx"
  - 排查：确认 Content-Type 为 multipart/form-data，文件扩展名为 xls/xlsx
- 已存在文档覆盖
  - 现象：返回"已存在接口文档，请传 force=true 覆盖上传"
  - 排查：在查询参数中添加 force=true
- 结构化失败
  - 现象：文档状态变为 failed，并返回错误信息
  - 排查：检查 Excel 内容是否包含 METHOD+路径或标准表格
- 资源不存在
  - 现象：返回"交易码不存在"或"案例不存在"
  - 排查：确认 projectId、transactionId、caseId 是否正确
- **新增**：前置步骤执行失败
  - 现象：调试执行中断，返回"前置步骤「步骤名」执行失败"或"共享变量「变量名」提取失败"
  - 排查：检查前置步骤的目标地址是否正确配置，步骤请求是否正常响应，变量提取表达式是否正确
  - 解决方案：确保前置步骤的 target.address 不为空，exports 配置正确，且步骤能够正常执行并返回预期的响应数据
- **新增**：SSL 证书验证失败
  - 现象：HTTPS 请求失败，错误信息包含"self signed certificate"或"certificate verify failed"
  - 排查：在调试请求中添加 `ignoreSslVerify: true` 参数，或在环境服务中启用相应的 SSL 验证忽略配置
  - 解决方案：对于自签名证书环境，建议在开发环境中启用忽略证书验证，生产环境应配置正确的证书链

**更新** 新增了前置步骤执行相关的故障排查指南，帮助解决依赖步骤配置和变量提取问题。同时增强了 SSL 证书验证相关的故障排查指南。

章节来源
- [apps/api/src/modules/api-test/controller/api-test.controller.ts:146-153](file://apps/api/src/modules/api-test/controller/api-test.controller.ts#L146-L153)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:68-70](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L68-L70)
- [apps/api/src/modules/api-test/service/api-doc.service.ts:99-103](file://apps/api/src/modules/api-test/service/api-doc.service.ts#L99-L103)
- [apps/api/src/modules/api-test/service/api-transaction.service.ts:150-159](file://apps/api/src/modules/api-test/service/api-transaction.service.ts#L150-L159)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:864-877](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L864-L877)
- [apps/api/src/modules/api-test/service/api-execution.service.ts:804-849](file://apps/api/src/modules/api-test/service/api-execution.service.ts#L804-L849)

## 结论
本控制器围绕"交易码—文档—用例—环境—执行集—执行—报告"的完整闭环，提供了清晰的 REST 接口与严格的参数校验。通过 DTO 封装输入、服务层封装业务、控制器统一封装响应，形成高内聚低耦合的架构。**最新增强**包括对前置步骤执行的支持，允许在调试执行前自动执行依赖步骤并提取共享变量，特别适用于复杂的认证流程和依赖管理场景。同时增强了对 SSL 证书验证的灵活控制，支持在调试和执行过程中根据需要忽略 HTTPS 证书验证，特别适用于自签名证书的测试环境。建议在生产环境中进一步完善异步任务、缓存与监控体系，以提升稳定性与可观测性。

## 附录
- 常用 HTTP 方法与路径
  - GET/POST/PATCH/DELETE/PUT：分别用于查询、创建、更新、删除与替换
  - 示例路径前缀：/api-test/{projectId}/transactions/{transactionId}/...
- 响应格式
  - 成功：返回业务数据或 {ok: true}
  - 下载：设置 Content-Type 与 Content-Disposition 后返回二进制流
- 最佳实践
  - 在前端对必填字段与格式进行预校验
  - 对大文件与长耗时操作采用异步任务与轮询
  - 对敏感字段（如 token）仅在必要时提交，避免泄露
  - **新增**：合理使用 prerequisiteSteps 参数来管理复杂的前置依赖，确保步骤间的变量传递正确
  - **新增**：在测试环境中合理使用 ignoreSslVerify 参数，但生产环境应谨慎使用并确保网络安全

**更新** 新增了关于前置步骤执行的最佳实践建议，指导如何正确使用 prerequisiteSteps 参数来管理复杂的依赖关系和变量传递。