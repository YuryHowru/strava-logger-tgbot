ALTER TABLE chat_challenges
ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Чат-челлендж';

ALTER TABLE chat_challenges
ALTER COLUMN winner_reward_xp SET DEFAULT 1000;

CREATE TABLE IF NOT EXISTS challenge_winner_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL REFERENCES chat_challenges(id) ON DELETE CASCADE,
    challenge_title TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS challenge_winner_badges_user_idx
ON challenge_winner_badges (user_id, unlocked_at DESC);
