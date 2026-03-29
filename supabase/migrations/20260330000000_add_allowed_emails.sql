-- 로그인 허용 이메일 목록 테이블
-- 초대 코드로 가족 합류 시 자동 추가됨
-- 직접 추가 방법:
--   INSERT INTO allowed_emails (email) VALUES ('you@gmail.com');
create table allowed_emails (
  email text primary key,
  created_at timestamptz default now()
);

-- service role만 접근 가능 (클라이언트에서 직접 조회/수정 불가)
alter table allowed_emails enable row level security;
