-- 가족 초대 코드 추가 (6자리 영숫자)
alter table families
  add column if not exists invite_code text unique
  default upper(substr(md5(gen_random_uuid()::text), 1, 6));

-- 초대 코드로 family_id 조회하는 함수 (RLS 우회)
create or replace function get_family_id_by_invite_code(p_code text)
returns uuid
language sql
security definer
stable
as $$
  select id from families where upper(invite_code) = upper(p_code)
$$;
