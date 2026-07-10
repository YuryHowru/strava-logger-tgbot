ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique_idx
ON users (telegram_id)
WHERE telegram_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_events (
    id SERIAL PRIMARY KEY,
    strava_activity_id BIGINT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_name TEXT NOT NULL,
    distance_m DOUBLE PRECISION,
    moving_time_s INTEGER,
    calories DOUBLE PRECISION,
    earned_xp INTEGER NOT NULL,
    started_at_utc TIMESTAMPTZ NOT NULL,
    started_at_local TIMESTAMPTZ NOT NULL,
    local_activity_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_events_user_date_idx
ON activity_events (user_id, local_activity_date);

CREATE INDEX IF NOT EXISTS activity_events_chat_started_at_idx
ON activity_events (chat_id, started_at_utc);

CREATE TABLE IF NOT EXISTS user_achievements (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
ON user_achievements (user_id, unlocked_at DESC);

CREATE TABLE IF NOT EXISTS chat_challenges (
    id SERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('xp', 'distance', 'activity_count')),
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'finished', 'stopped')),
    created_by_telegram_id BIGINT NOT NULL,
    winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    winner_reward_xp INTEGER NOT NULL DEFAULT 100,
    finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_challenges_one_active_idx
ON chat_challenges (chat_id)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS challenge_participants (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES chat_challenges(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (challenge_id, user_id)
);
