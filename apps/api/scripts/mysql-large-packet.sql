-- 大报文案例仍可能包含数 MB 的请求体。应用已避免重复保存同一报文，
-- 但 MySQL 单条 SQL 还需要服务端 max_allowed_packet 足够大。
-- 请使用具备 SYSTEM_VARIABLES_ADMIN（或 SUPER）权限的账号执行。

SET GLOBAL max_allowed_packet = 67108864;
SHOW VARIABLES LIKE 'max_allowed_packet';

-- 若需要永久生效，请在 MySQL 配置中增加：
-- [mysqld]
-- max_allowed_packet=64M
--
-- 修改后新建连接才会使用新值，建议随后重启 caseforge-api 连接池。
