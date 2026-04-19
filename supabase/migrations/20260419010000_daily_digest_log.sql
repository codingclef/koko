-- daily_digest_log: 매일 아침 digest push 발송 기록
-- PRIMARY KEY (user_id, sent_date)로 중복 발송 방지 (INSERT ON CONFLICT DO NOTHING)
CREATE TABLE daily_digest_log (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_date date        NOT NULL,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sent_date)
);

ALTER TABLE daily_digest_log ENABLE ROW LEVEL SECURITY;
