-- CaseForge 索引优化脚本（MySQL 8+）
-- 适用：生产/测试库已存在表结构、未开启 TypeORM synchronize 时手动执行。
-- 开发环境若 synchronize=true，重启 API 后 TypeORM 也会尝试同步实体上的 @Index。
-- 若索引已存在会报 Duplicate key name，可忽略对应语句。

USE case_forge;

-- case_tree：复合索引（单列 parentId/caseEditorId/projectId 由外键保留，勿 DROP）
CREATE INDEX idx_case_tree_editor_parent_sort ON case_tree (caseEditorId, parentId, sortOrder);
CREATE INDEX idx_case_tree_parent_sort ON case_tree (parentId, sortOrder);

-- case_editor：项目下列运行、按 projectId+runId 查询
CREATE INDEX idx_case_editor_project_run ON case_editor (projectId, id);

-- case_constraint：按结构化文档清理（如有）
CREATE INDEX idx_case_constraint_struct_doc ON case_constraint (structDocId);

-- case_test_point_prompt：按提示词反查（testPointId 由唯一索引左前缀覆盖）
CREATE INDEX idx_test_point_prompt_prompt ON case_test_point_prompt (promptId);

-- scenario_library
CREATE INDEX idx_scenario_library_active_updated ON scenario_library (isActive, updatedAt);
CREATE INDEX idx_scenario_library_name ON scenario_library (name);
CREATE INDEX idx_scenario_library_user_updated ON scenario_library (createdBy, updatedAt);

-- case_project：列表与编号校验
CREATE INDEX idx_case_project_user_platform_updated ON case_project (createdBy, platform, updatedAt);
CREATE INDEX idx_case_project_platform_requirement ON case_project (platform, requirementNo);

-- case_struct_doc：启动恢复 processing 状态
CREATE INDEX idx_case_struct_doc_structuring_status ON case_struct_doc (structuringStatus);

-- case_test_point：列表排序与功能模块筛选
CREATE INDEX idx_case_test_point_project_struct_created ON case_test_point (projectId, structDocId, createdAt);
CREATE INDEX idx_case_test_point_project_struct_module ON case_test_point (projectId, structDocId, featureModule);

-- case_test_point_instruct：启动恢复「生成中」
CREATE INDEX idx_case_test_point_instruct_status ON case_test_point_instruct (status);

-- case_generate_job：队列调度与统计
CREATE INDEX idx_case_generate_job_project_status_queued ON case_generate_job (projectId, status, queuedAt);
CREATE INDEX idx_case_generate_job_test_point_status ON case_generate_job (testPointId, status);
CREATE INDEX idx_case_generate_job_status_finished ON case_generate_job (status, finishedAt);

-- struct_requirement_job：项目级活跃任务
CREATE INDEX idx_struct_requirement_job_project_status_queued ON struct_requirement_job (projectId, status, queuedAt);

-- api_endpoint / api_test_case / api_test_run
CREATE INDEX idx_api_endpoint_project_transaction ON api_endpoint (projectId, transactionId);
CREATE INDEX idx_api_test_case_project_endpoint ON api_test_case (projectId, endpointId);
CREATE INDEX idx_api_test_run_project_created ON api_test_run (projectId, createdAt);
-- api_test_run_item：runId 单列索引供外键使用，勿 DROP
CREATE INDEX idx_api_test_run_item_run_created ON api_test_run_item (runId, createdAt);

-- api 环境与执行集
CREATE INDEX idx_api_test_env_project_default ON api_test_environment (projectId, isDefault);
CREATE INDEX idx_api_test_env_service_project_env ON api_test_environment_service (projectId, environmentId);
CREATE INDEX idx_api_test_exec_set_project_tx_updated ON api_test_execution_set (projectId, transactionId, updatedAt);
CREATE INDEX idx_api_test_exec_set_case_sort ON api_test_execution_set_case (executionSetId, sortOrder);

-- 清理冗余索引（被复合/唯一索引左前缀覆盖；外键依赖的索引勿 DROP）
ALTER TABLE case_project DROP INDEX idx_case_project_updated_at;
ALTER TABLE case_project DROP INDEX idx_case_project_requirement_no;
ALTER TABLE struct_requirement_job DROP INDEX idx_struct_requirement_job_project;
ALTER TABLE api_transaction DROP INDEX idx_api_transaction_project;
ALTER TABLE api_test_run DROP INDEX idx_api_test_run_project;
ALTER TABLE api_test_environment DROP INDEX idx_api_test_env_project;
ALTER TABLE api_test_execution_set DROP INDEX idx_api_test_exec_set_project;
ALTER TABLE api_test_execution_set DROP INDEX idx_api_test_exec_set_transaction;

-- 可选：项目标题/需求编号模糊搜索（数据量大时再启用）
-- ALTER TABLE case_project ADD FULLTEXT INDEX ft_case_project_search (title, requirementNo);
