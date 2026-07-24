CREATE TABLE IF NOT EXISTS scheduled_reports (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chat_id, report_type, period_key)
);

CREATE INDEX IF NOT EXISTS scheduled_reports_chat_type_idx
ON scheduled_reports (chat_id, report_type, sent_at DESC);

CREATE TABLE IF NOT EXISTS xp_grants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grant_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    xp INTEGER NOT NULL CHECK (xp > 0),
    reason TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, grant_type, period_key)
);

CREATE INDEX IF NOT EXISTS xp_grants_user_idx
ON xp_grants (user_id, granted_at DESC);
