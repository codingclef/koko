ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS show_lunar boolean NOT NULL DEFAULT false;
