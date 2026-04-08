-- 1. allowed_emails에 앱 수준 권한 컬럼 추가
ALTER TABLE allowed_emails
  ADD COLUMN app_role text NOT NULL DEFAULT 'member',
  ADD CONSTRAINT allowed_emails_app_role_check CHECK (app_role IN ('admin', 'member'));

-- 2. 앱 초대 테이블 생성 (가족 초대와 분리, 1회용 + 만료 기간 있음)
CREATE TABLE app_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        UNIQUE NOT NULL,
  created_by uuid        REFERENCES auth.users(id),
  used_by_email text,
  used_at    timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_invites ENABLE ROW LEVEL SECURITY;
-- 모든 조작은 service role key를 사용하는 API route를 통해서만 허용
-- 클라이언트 직접 접근 불가

-- 3. get_my_family: 조회 전용 (자동 생성 없음)
CREATE OR REPLACE FUNCTION get_my_family(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT family_id FROM family_members WHERE user_id = p_user_id
$$;

-- 4. create_family_with_name: 이름을 받아 가족을 명시적으로 생성
CREATE OR REPLACE FUNCTION create_family_with_name(p_user_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_family_id uuid;
  v_code      text;
BEGIN
  -- 이미 가족이 있으면 그대로 반환 (멱등성)
  SELECT family_id INTO v_family_id
  FROM family_members WHERE user_id = p_user_id;

  IF v_family_id IS NOT NULL THEN
    RETURN v_family_id;
  END IF;

  -- 고유한 초대 코드 생성
  LOOP
    v_code := UPPER(SUBSTR(MD5(GEN_RANDOM_UUID()::TEXT), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE UPPER(invite_code) = v_code);
  END LOOP;

  INSERT INTO families (name, invite_code)
  VALUES (TRIM(p_name), v_code)
  RETURNING id INTO v_family_id;

  INSERT INTO family_members (family_id, user_id, display_name, role)
  VALUES (v_family_id, p_user_id, 'Member', 'admin');

  RETURN v_family_id;
END;
$$;
