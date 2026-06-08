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

-- case_project：侧边栏/列表按更新时间排序
CREATE INDEX idx_case_project_updated_at ON case_project (updatedAt);

-- case_constraint：按结构化文档清理（如有）
CREATE INDEX idx_case_constraint_struct_doc ON case_constraint (structDocId);

-- case_test_point_prompt：按提示词反查（testPointId 索引由外键保留）
CREATE INDEX idx_test_point_prompt_prompt ON case_test_point_prompt (promptId);

-- scenario_library：列表筛选启用场景
CREATE INDEX idx_scenario_library_active_updated ON scenario_library (isActive, updatedAt);
CREATE INDEX idx_scenario_library_name ON scenario_library (name);

-- 可选：项目标题/需求编号模糊搜索（数据量大时再启用）
-- ALTER TABLE case_project ADD FULLTEXT INDEX ft_case_project_search (title, requirementNo);
