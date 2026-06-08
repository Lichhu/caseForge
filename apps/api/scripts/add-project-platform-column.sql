-- 双平台项目隔离：为 case_project 增加 platform 字段（已有库需手动执行一次）
-- 用法：mysql -u root -p case_forge < apps/api/scripts/add-project-platform-column.sql

ALTER TABLE case_project
  ADD COLUMN platform ENUM('case-forge', 'api-test') NOT NULL DEFAULT 'case-forge'
  COMMENT '所属产品线'
  AFTER description;

UPDATE case_project SET platform = 'case-forge' WHERE platform IS NULL OR platform = '';

CREATE INDEX idx_case_project_platform_updated ON case_project (platform, updatedAt);
