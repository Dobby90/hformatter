export const SQL_DIALECTS = [
  { id: 'postgresql', name: 'PostgreSQL', validate: true },
  { id: 'mysql', name: 'MySQL', validate: true },
  { id: 'mariadb', name: 'MariaDB', validate: true },
  { id: 'plsql', name: 'Oracle', validate: true },
  { id: 'clickhouse', name: 'ClickHouse', validate: true },
] as const;
export type SqlDialect = typeof SQL_DIALECTS[number]['id'];
export type KeywordCase = 'preserve' | 'upper' | 'lower';
export const SQL_SAMPLES: Record<SqlDialect, string> = {
  postgresql: "-- 부서별 활성 사용자\nwith active_users as (select id, department, created_at from users where enabled = true) select department, count(*) as user_count from active_users where created_at >= now() - interval '30 days' group by department order by user_count desc limit 10;",
  mysql: "-- 부서별 활성 사용자\nselect `department`, count(*) as user_count from `users` where `enabled` = 1 and `created_at` >= date_sub(now(), interval 30 day) group by `department` order by user_count desc limit 10;",
  mariadb: "-- 부서별 활성 사용자\nwith active_users as (select id, department from users where enabled = 1) select department, count(*) as user_count from active_users group by department order by user_count desc limit 10;",
  plsql: "-- 부서별 활성 사용자\nselect /*+ FIRST_ROWS(10) */ department, count(*) as user_count from users where enabled = 1 and created_at >= sysdate - 30 group by department order by user_count desc fetch first 10 rows only;",
  clickhouse: "-- 일별 이벤트 수\nselect toDate(event_time) as event_date, count() as event_count from events prewhere event_time >= now() - interval 7 day group by event_date order by event_date desc limit 10;",
};
