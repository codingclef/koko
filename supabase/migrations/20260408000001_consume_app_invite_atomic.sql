-- consume_app_invite: 앱 초대 코드 소비를 원자적으로 처리
-- SELECT FOR UPDATE SKIP LOCKED으로 동시 요청이 들어와도 한 번만 성공한다.
CREATE OR REPLACE FUNCTION consume_app_invite(p_code text, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_id uuid;
  v_now       timestamptz := now();
BEGIN
  -- 유효한 초대를 찾아 잠금 (다른 트랜잭션이 선점했으면 즉시 skip)
  SELECT id INTO v_invite_id
  FROM app_invites
  WHERE upper(code) = upper(p_code)
    AND used_at IS NULL
    AND expires_at > v_now
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 초대를 사용 완료로 마킹
  UPDATE app_invites
  SET used_by_email = lower(p_email),
      used_at       = v_now
  WHERE id = v_invite_id;

  -- allowed_emails에 추가 (이미 있으면 무시)
  INSERT INTO allowed_emails (email)
  VALUES (lower(p_email))
  ON CONFLICT (email) DO NOTHING;

  RETURN true;
END;
$$;
