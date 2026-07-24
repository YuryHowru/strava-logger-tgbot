CREATE TABLE IF NOT EXISTS chat_boss_battles (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    boss_name TEXT NOT NULL,
    hp INTEGER NOT NULL CHECK (hp > 0),
    current_damage INTEGER NOT NULL DEFAULT 0 CHECK (current_damage >= 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'defeated', 'expired')),
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    defeated_at TIMESTAMPTZ,
    UNIQUE (chat_id, period_key)
);

CREATE INDEX IF NOT EXISTS chat_boss_battles_chat_period_idx
ON chat_boss_battles (chat_id, period_key);
