import { pool } from './config';
import { log } from '../../shared/logger';

const schemaQueries = [
    `
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS telegram_id BIGINT
    `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique_idx
    ON users (telegram_id)
    WHERE telegram_id IS NOT NULL
    `,
    `
    CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        telegram_id BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
    ON auth_sessions (expires_at)
    `,
    `
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
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS activity_events_user_date_idx
    ON activity_events (user_id, local_activity_date)
    `,
    `
    CREATE INDEX IF NOT EXISTS activity_events_chat_started_at_idx
    ON activity_events (chat_id, started_at_utc)
    `,
    `
    CREATE TABLE IF NOT EXISTS user_achievements (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_key TEXT NOT NULL,
        unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, badge_key)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS user_achievements_user_idx
    ON user_achievements (user_id, unlocked_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS chat_challenges (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        title TEXT NOT NULL,
        metric TEXT NOT NULL CHECK (metric IN ('xp', 'distance', 'activity_count')),
        duration_days INTEGER NOT NULL CHECK (duration_days > 0),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'finished', 'stopped')),
        created_by_telegram_id BIGINT NOT NULL,
        winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        winner_reward_xp INTEGER NOT NULL DEFAULT 1000,
        finished_at TIMESTAMPTZ
    )
    `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS chat_challenges_one_active_idx
    ON chat_challenges (chat_id)
    WHERE status = 'active'
    `,
    `
    ALTER TABLE chat_challenges
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Чат-челлендж'
    `,
    `
    CREATE TABLE IF NOT EXISTS challenge_winner_badges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        challenge_id INTEGER NOT NULL REFERENCES chat_challenges(id) ON DELETE CASCADE,
        challenge_title TEXT NOT NULL,
        unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, challenge_id)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS challenge_winner_badges_user_idx
    ON challenge_winner_badges (user_id, unlocked_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS challenge_participants (
        id SERIAL PRIMARY KEY,
        challenge_id INTEGER NOT NULL REFERENCES chat_challenges(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (challenge_id, user_id)
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS scheduled_reports (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        period_key TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (chat_id, report_type, period_key)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS scheduled_reports_chat_type_idx
    ON scheduled_reports (chat_id, report_type, sent_at DESC)
    `,
    `
    CREATE TABLE IF NOT EXISTS xp_grants (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grant_type TEXT NOT NULL,
        period_key TEXT NOT NULL,
        xp INTEGER NOT NULL CHECK (xp > 0),
        reason TEXT NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, grant_type, period_key)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS xp_grants_user_idx
    ON xp_grants (user_id, granted_at DESC)
    `,
    `
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
    )
    `,
    `
    CREATE UNIQUE INDEX IF NOT EXISTS comeback_campaigns_one_active_user_idx
    ON comeback_campaigns (user_id)
    WHERE status = 'active'
    `,
    `
    CREATE INDEX IF NOT EXISTS comeback_campaigns_user_started_idx
    ON comeback_campaigns (user_id, started_at DESC)
    `,
    `
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
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS user_quests_user_period_idx
    ON user_quests (user_id, period_key)
    `,
    `
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
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS chat_boss_battles_chat_period_idx
    ON chat_boss_battles (chat_id, period_key)
    `,
    `
    CREATE TABLE IF NOT EXISTS monthly_awards (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        period_key TEXT NOT NULL,
        award_type TEXT NOT NULL,
        winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reward_xp INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (chat_id, period_key, award_type)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS monthly_awards_chat_period_idx
    ON monthly_awards (chat_id, period_key)
    `,
];

export async function initializeDatabase(): Promise<void> {
    for (const query of schemaQueries) {
        await pool.query(query);
    }

    log('INIT', 'Database schema ensured for badges and challenges.');
}
