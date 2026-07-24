CREATE TABLE IF NOT EXISTS monthly_awards (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    award_type TEXT NOT NULL,
    winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reward_xp INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chat_id, period_key, award_type)
);

CREATE INDEX IF NOT EXISTS monthly_awards_chat_period_idx
ON monthly_awards (chat_id, period_key);
