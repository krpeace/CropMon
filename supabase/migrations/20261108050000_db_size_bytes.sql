-- 목적: croplib-dp #28 S3(croplib-dp#61) DB 용량 감시를 위한 pg_database_size 및 상위 10개 표 크기 조회 RPC (#77).
--
-- 실행 방법:
--   1. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여 넣고 Run 을 누른다.
--   2. 여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md

create or replace function public.db_size_bytes()
returns jsonb
language plpgsql
as $$
declare
  v_db_bytes bigint;
  v_tables jsonb;
begin
  -- 1. 전체 데이터베이스 크기 (바이트)
  v_db_bytes := pg_database_size(current_database());

  -- 2. public 및 krei 스키마에서 가장 용량이 큰 상위 10개 기본 테이블 크기 (인덱스, TOAST 포함)
  select coalesce(
    jsonb_object_agg(
      case when schemaname = 'public' then tablename else schemaname || '.' || tablename end,
      tbl_bytes
    ),
    '{}'::jsonb
  )
  into v_tables
  from (
    select
      schemaname,
      tablename,
      pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename)) as tbl_bytes
    from pg_tables
    where schemaname in ('public', 'krei')
    order by tbl_bytes desc
    limit 10
  ) top_tables;

  return jsonb_build_object(
    'db_bytes', v_db_bytes,
    'tables', coalesce(v_tables, '{}'::jsonb)
  );
end;
$$;

-- 읽기 권한: anon, authenticated 권한을 완전히 박탈하고 service_role 만 실행 허용
revoke all on function public.db_size_bytes() from public, anon, authenticated;
grant execute on function public.db_size_bytes() to service_role;
