CREATE TABLE IF NOT EXISTS user_quests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    quest_type TEXT NOT NULL CHECK (quest_type IN ('activity_count', 'xp', 'active_days')),
    target_value INTEGER NOT NULL CHECK (target_value > 0),
    reward_xp INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, period_key, quest_type)
);

CREATE INDEX IF NOT EXISTS user_quests_user_period_idx
ON user_quests (user_id, period_key);
