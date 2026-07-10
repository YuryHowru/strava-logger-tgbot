CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    telegram_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
ON auth_sessions (expires_at);
