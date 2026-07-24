CREATE TABLE IF NOT EXISTS comeback_campaigns (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_activity_event_id INTEGER NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    completed_activity_event_id INTEGER REFERENCES activity_events(id) ON DELETE SET NULL,
    inactivity_days INTEGER NOT NULL CHECK (inactivity_days >= 7),
    reward_xp INTEGER NOT NULL DEFAULT 200,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS comeback_campaigns_one_active_user_idx
ON comeback_campaigns (user_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS comeback_campaigns_user_started_idx
ON comeback_campaigns (user_id, started_at DESC);
