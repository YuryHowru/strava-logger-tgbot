import { pool } from './config';
import type { Queryable } from './types';
import type { ActivityEvent, LevelInfo, User } from '../../features/activities/types';
import type { UserAchievement, BadgeKey, ChallengeWinnerBadge } from '../../features/achievements/types';
import type { ChallengeMetric, ChatChallenge, ChallengeStandingRow } from '../../features/challenges/types';
import type { ComebackCampaign } from '../../features/comeback/types';
import type { WeeklySummaryRow } from '../../features/weekly/types';
import { log } from '../../shared/logger';

type AuthSession = {
    token: string;
    chat_id: string;
    telegram_id: number;
    created_at: Date;
    expires_at: Date;
    used_at: Date | null;
};

const challengeMetricSqlMap: Record<ChallengeMetric, string> = {
    xp: 'COALESCE(SUM(a.earned_xp), 0)',
    distance: 'COALESCE(SUM(COALESCE(a.distance_m, 0)), 0)',
    activity_count: 'COUNT(a.id)',
};

export async function findLevelInDb(
    xp: number,
    db: Queryable = pool
): Promise<LevelInfo & { total_required_xp: number }> {
    const levelsQuery = await db.query<LevelInfo>(`
        SELECT * FROM levels ORDER BY level ASC
    `);

    const levels = levelsQuery.rows;
    if (!levels.length) throw new Error('[DB] Levels table is empty!');

    const foundLevel = levels.find(({ total_required_xp }) => total_required_xp > xp) ?? levels[levels.length - 1];
    log('DB', 'Found level info', foundLevel);
    return foundLevel;
}

export async function getUserByTelegramId(telegramId: number, db: Queryable = pool): Promise<User | null> {
    const result = await db.query<User>('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return result.rows[0] || null;
}

export async function createAuthSession(
    {
        token,
        chatId,
        telegramId,
        expiresAt,
    }: {
        token: string;
        chatId: string;
        telegramId: number;
        expiresAt: Date;
    },
    db: Queryable = pool
): Promise<void> {
    await db.query(
        `
        DELETE FROM auth_sessions
        WHERE telegram_id = $1
           OR expires_at <= NOW()
        `,
        [telegramId]
    );

    await db.query(
        `
        INSERT INTO auth_sessions (token, chat_id, telegram_id, expires_at)
        VALUES ($1, $2, $3, $4)
        `,
        [token, chatId, telegramId, expiresAt]
    );
}

export async function consumeAuthSession(token: string, db: Queryable = pool): Promise<AuthSession | null> {
    const result = await db.query<AuthSession>(
        `
        UPDATE auth_sessions
        SET used_at = NOW()
        WHERE token = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        RETURNING *
        `,
        [token]
    );

    return result.rows[0] || null;
}

export async function getUserByAthleteId(athleteId: number, db: Queryable = pool): Promise<User | null> {
    const result = await db.query<User>('SELECT * FROM users WHERE athleteid = $1', [athleteId]);
    return result.rows[0] || null;
}

export async function getUserById(userId: number, db: Queryable = pool): Promise<User | null> {
    const result = await db.query<User>('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
}

export async function getUserByUsername(username: string, db: Queryable = pool): Promise<User | null> {
    const result = await db.query<User>('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
}

export async function getTopUsers(limit: number = 10, db: Queryable = pool): Promise<User[]> {
    const topUsersQuery = await db.query<User>(
        `
        SELECT username, level, xp
        FROM users
        ORDER BY level DESC, xp DESC
        LIMIT $1
        `,
        [limit]
    );

    return topUsersQuery.rows;
}

export async function updateUserStats(
    userId: number,
    xp: number,
    level: number,
    lastActivityTimestamp: number,
    streakCount: number,
    db: Queryable = pool
): Promise<void> {
    await db.query(
        `
        UPDATE users
        SET xp = $1, level = $2, last_activity = to_timestamp($3), streak_count = $4
        WHERE id = $5
        `,
        [xp, level, lastActivityTimestamp, streakCount, userId]
    );
}

export async function updateUserXpAndLevel(
    userId: number,
    xp: number,
    level: number,
    db: Queryable = pool
): Promise<void> {
    await db.query('UPDATE users SET xp = $1, level = $2 WHERE id = $3', [xp, level, userId]);
}

export async function grantUserXpOnce(
    {
        userId,
        grantType,
        periodKey,
        xp,
        reason,
    }: {
        userId: number;
        grantType: string;
        periodKey: string;
        xp: number;
        reason: string;
    },
    db: Queryable = pool
): Promise<boolean> {
    const grantResult = await db.query(
        `
        INSERT INTO xp_grants (user_id, grant_type, period_key, xp, reason)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, grant_type, period_key) DO NOTHING
        RETURNING id
        `,
        [userId, grantType, periodKey, xp, reason]
    );

    if (!grantResult.rowCount) {
        return false;
    }

    const user = await getUserById(userId, db);
    if (!user) {
        throw new Error(`Cannot grant XP to missing user ${userId}`);
    }

    const newXp = user.xp + xp;
    const levelInfo = await findLevelInDb(newXp, db);
    await updateUserXpAndLevel(user.id, newXp, levelInfo.level, db);

    return true;
}

export async function createActivityEvent(
    event: Omit<ActivityEvent, 'id' | 'created_at'>,
    db: Queryable = pool
): Promise<ActivityEvent | null> {
    const result = await db.query<ActivityEvent>(
        `
        INSERT INTO activity_events (
            strava_activity_id,
            user_id,
            chat_id,
            activity_type,
            activity_name,
            distance_m,
            moving_time_s,
            calories,
            earned_xp,
            started_at_utc,
            started_at_local,
            local_activity_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (strava_activity_id) DO NOTHING
        RETURNING *
        `,
        [
            event.strava_activity_id,
            event.user_id,
            event.chat_id,
            event.activity_type,
            event.activity_name,
            event.distance_m,
            event.moving_time_s,
            event.calories,
            event.earned_xp,
            event.started_at_utc,
            event.started_at_local,
            event.local_activity_date,
        ]
    );

    return result.rows[0] || null;
}

export async function countUserActivitiesOnDate(
    userId: number,
    localActivityDate: string,
    db: Queryable = pool
): Promise<number> {
    const result = await db.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM activity_events
        WHERE user_id = $1 AND local_activity_date = $2
        `,
        [userId, localActivityDate]
    );

    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function countUserActivitiesByTypeOnDate(
    userId: number,
    activityType: string,
    localActivityDate: string,
    db: Queryable = pool
): Promise<number> {
    const result = await db.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM activity_events
        WHERE user_id = $1
          AND activity_type = $2
          AND local_activity_date = $3
        `,
        [userId, activityType, localActivityDate]
    );

    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function insertUserAchievements(
    userId: number,
    badgeKeys: BadgeKey[],
    db: Queryable = pool
): Promise<BadgeKey[]> {
    const insertedBadges: BadgeKey[] = [];

    for (const badgeKey of badgeKeys) {
        const result = await db.query<UserAchievement>(
            `
            INSERT INTO user_achievements (user_id, badge_key)
            VALUES ($1, $2)
            ON CONFLICT (user_id, badge_key) DO NOTHING
            RETURNING badge_key, unlocked_at
            `,
            [userId, badgeKey]
        );

        if (result.rows[0]) {
            insertedBadges.push(result.rows[0].badge_key);
        }
    }

    return insertedBadges;
}

export async function getUserAchievements(userId: number, db: Queryable = pool): Promise<UserAchievement[]> {
    const result = await db.query<UserAchievement>(
        `
        SELECT badge_key, unlocked_at
        FROM user_achievements
        WHERE user_id = $1
        ORDER BY unlocked_at ASC
        `,
        [userId]
    );

    return result.rows;
}

export async function createChallengeWinnerBadge(
    userId: number,
    challengeId: number,
    challengeTitle: string,
    db: Queryable = pool
): Promise<ChallengeWinnerBadge | null> {
    const result = await db.query<ChallengeWinnerBadge>(
        `
        INSERT INTO challenge_winner_badges (user_id, challenge_id, challenge_title)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, challenge_id) DO NOTHING
        RETURNING challenge_id, challenge_title, unlocked_at
        `,
        [userId, challengeId, challengeTitle]
    );

    return result.rows[0] || null;
}

export async function getChallengeWinnerBadges(
    userId: number,
    db: Queryable = pool
): Promise<ChallengeWinnerBadge[]> {
    const result = await db.query<ChallengeWinnerBadge>(
        `
        SELECT challenge_id, challenge_title, unlocked_at
        FROM challenge_winner_badges
        WHERE user_id = $1
        ORDER BY unlocked_at ASC
        `,
        [userId]
    );

    return result.rows;
}

export async function getActiveChatIds(db: Queryable = pool): Promise<string[]> {
    const result = await db.query<{ chatid: string }>(
        `
        SELECT DISTINCT chatid::text AS chatid
        FROM users
        WHERE chatid IS NOT NULL
        ORDER BY chatid::text ASC
        `
    );

    return result.rows.map((row) => row.chatid);
}

export async function reserveScheduledReport(
    {
        chatId,
        reportType,
        periodKey,
    }: {
        chatId: string;
        reportType: string;
        periodKey: string;
    },
    db: Queryable = pool
): Promise<boolean> {
    const result = await db.query(
        `
        INSERT INTO scheduled_reports (chat_id, report_type, period_key)
        VALUES ($1, $2, $3)
        ON CONFLICT (chat_id, report_type, period_key) DO NOTHING
        RETURNING id
        `,
        [chatId, reportType, periodKey]
    );

    return Boolean(result.rowCount);
}

export async function getWeeklySummaryRows(
    {
        chatId,
        startDate,
        endDate,
    }: {
        chatId: string;
        startDate: string;
        endDate: string;
    },
    db: Queryable = pool
): Promise<WeeklySummaryRow[]> {
    const result = await db.query<WeeklySummaryRow>(
        `
        SELECT
            u.id AS user_id,
            u.username,
            COUNT(a.id)::int AS activities_count,
            COALESCE(SUM(a.earned_xp), 0)::int AS total_xp,
            COALESCE(SUM(COALESCE(a.distance_m, 0)), 0)::float AS total_distance_m,
            COUNT(DISTINCT a.local_activity_date)::int AS active_days
        FROM activity_events a
        JOIN users u ON u.id = a.user_id
        WHERE a.chat_id = $1
          AND a.local_activity_date >= $2::date
          AND a.local_activity_date < $3::date
        GROUP BY u.id, u.username
        ORDER BY total_xp DESC, activities_count DESC, u.username ASC
        `,
        [chatId, startDate, endDate]
    );

    return result.rows.map((row) => ({
        ...row,
        activities_count: Number(row.activities_count),
        total_xp: Number(row.total_xp),
        total_distance_m: Number(row.total_distance_m),
        active_days: Number(row.active_days),
    }));
}

export async function getActiveComebackCampaign(
    userId: number,
    db: Queryable = pool
): Promise<ComebackCampaign | null> {
    const result = await db.query<ComebackCampaign>(
        `
        SELECT *
        FROM comeback_campaigns
        WHERE user_id = $1
          AND status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}

export async function expireUserComebackCampaigns(
    userId: number,
    now: Date,
    db: Queryable = pool
): Promise<void> {
    await db.query(
        `
        UPDATE comeback_campaigns
        SET status = 'expired'
        WHERE user_id = $1
          AND status = 'active'
          AND expires_at < $2
        `,
        [userId, now]
    );
}

export async function hasRecentComebackCampaign(
    userId: number,
    since: Date,
    db: Queryable = pool
): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM comeback_campaigns
            WHERE user_id = $1
              AND started_at >= $2
        ) AS exists
        `,
        [userId, since]
    );

    return Boolean(result.rows[0]?.exists);
}

export async function createComebackCampaign(
    {
        userId,
        triggerActivityEventId,
        inactivityDays,
        rewardXp,
        expiresAt,
    }: {
        userId: number;
        triggerActivityEventId: number;
        inactivityDays: number;
        rewardXp: number;
        expiresAt: Date;
    },
    db: Queryable = pool
): Promise<ComebackCampaign | null> {
    const result = await db.query<ComebackCampaign>(
        `
        INSERT INTO comeback_campaigns (
            user_id,
            trigger_activity_event_id,
            inactivity_days,
            reward_xp,
            status,
            expires_at
        )
        VALUES ($1, $2, $3, $4, 'active', $5)
        ON CONFLICT DO NOTHING
        RETURNING *
        `,
        [userId, triggerActivityEventId, inactivityDays, rewardXp, expiresAt]
    );

    return result.rows[0] || null;
}

export async function completeComebackCampaign(
    campaignId: number,
    completedActivityEventId: number,
    completedAt: Date,
    db: Queryable = pool
): Promise<ComebackCampaign | null> {
    const result = await db.query<ComebackCampaign>(
        `
        UPDATE comeback_campaigns
        SET status = 'completed',
            completed_activity_event_id = $2,
            completed_at = $3
        WHERE id = $1
          AND status = 'active'
        RETURNING *
        `,
        [campaignId, completedActivityEventId, completedAt]
    );

    return result.rows[0] || null;
}

export async function createChallenge(
    {
        chatId,
        title,
        metric,
        durationDays,
        createdByTelegramId,
        startsAt,
        endsAt,
    }: {
        chatId: string;
        title: string;
        metric: ChallengeMetric;
        durationDays: number;
        createdByTelegramId: number;
        startsAt: Date;
        endsAt: Date;
    },
    db: Queryable = pool
): Promise<ChatChallenge | null> {
    const result = await db.query<ChatChallenge>(
        `
        INSERT INTO chat_challenges (
            chat_id,
            title,
            metric,
            duration_days,
            starts_at,
            ends_at,
            status,
            created_by_telegram_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
        ON CONFLICT DO NOTHING
        RETURNING *
        `,
        [chatId, title, metric, durationDays, startsAt, endsAt, createdByTelegramId]
    );

    return result.rows[0] || null;
}

export async function getActiveChallengeByChatId(
    chatId: string,
    db: Queryable = pool
): Promise<ChatChallenge | null> {
    const result = await db.query<ChatChallenge>(
        `
        SELECT *
        FROM chat_challenges
        WHERE chat_id = $1 AND status = 'active'
        ORDER BY starts_at DESC
        LIMIT 1
        `,
        [chatId]
    );

    return result.rows[0] || null;
}

export async function joinChallenge(
    challengeId: number,
    userId: number,
    joinedAt: Date,
    db: Queryable = pool
): Promise<boolean> {
    const result = await db.query(
        `
        INSERT INTO challenge_participants (challenge_id, user_id, joined_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (challenge_id, user_id) DO NOTHING
        RETURNING id
        `,
        [challengeId, userId, joinedAt]
    );

    return Boolean(result.rowCount);
}

export async function isChallengeParticipant(
    challengeId: number,
    userId: number,
    db: Queryable = pool
): Promise<boolean> {
    const result = await db.query<{ exists: boolean }>(
        `
        SELECT EXISTS (
            SELECT 1
            FROM challenge_participants
            WHERE challenge_id = $1 AND user_id = $2
        ) AS exists
        `,
        [challengeId, userId]
    );

    return Boolean(result.rows[0]?.exists);
}

export async function getChallengeParticipants(
    challengeId: number,
    db: Queryable = pool
): Promise<Array<{ user_id: number; username: string; joined_at: Date }>> {
    const result = await db.query<Array<{ user_id: number; username: string; joined_at: Date }>[number]>(
        `
        SELECT cp.user_id, u.username, cp.joined_at
        FROM challenge_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.challenge_id = $1
        ORDER BY cp.joined_at ASC, u.username ASC
        `,
        [challengeId]
    );

    return result.rows;
}

export async function getChallengeStandings(
    challenge: ChatChallenge,
    db: Queryable = pool
): Promise<ChallengeStandingRow[]> {
    const metricSql = challengeMetricSqlMap[challenge.metric];

    const result = await db.query<ChallengeStandingRow>(
        `
        SELECT
            u.id AS user_id,
            u.username,
            ${metricSql} AS metric_value,
            MAX(a.started_at_utc) AS achieved_at
        FROM challenge_participants cp
        JOIN users u ON u.id = cp.user_id
        LEFT JOIN activity_events a
            ON a.user_id = cp.user_id
           AND a.chat_id = $2
           AND a.started_at_utc >= GREATEST($3::timestamptz, cp.joined_at)
           AND a.started_at_utc <= $4::timestamptz
        WHERE cp.challenge_id = $1
        GROUP BY u.id, u.username
        ORDER BY metric_value DESC, achieved_at ASC NULLS LAST, u.username ASC
        `,
        [challenge.id, challenge.chat_id, challenge.starts_at, challenge.ends_at]
    );

    return result.rows.map((row) => ({
        ...row,
        metric_value: Number(row.metric_value),
    }));
}

export async function completeChallenge(
    {
        challengeId,
        status,
        winnerUserId,
        winnerRewardXp,
        finishedAt,
    }: {
        challengeId: number;
        status: 'finished' | 'stopped';
        winnerUserId: number | null;
        winnerRewardXp: number;
        finishedAt: Date;
    },
    db: Queryable = pool
): Promise<ChatChallenge | null> {
    const result = await db.query<ChatChallenge>(
        `
        UPDATE chat_challenges
        SET status = $2,
            winner_user_id = $3,
            winner_reward_xp = $4,
            finished_at = $5
        WHERE id = $1
          AND status = 'active'
        RETURNING *
        `,
        [challengeId, status, winnerUserId, winnerRewardXp, finishedAt]
    );

    return result.rows[0] || null;
}

export async function countUserChallengeVictories(userId: number, db: Queryable = pool): Promise<number> {
    const result = await db.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM chat_challenges
        WHERE winner_user_id = $1
        `,
        [userId]
    );

    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function isTelegramUserAdmin(telegramId: number, db: Queryable = pool): Promise<boolean> {
    const result = await db.query<{ is_admin: boolean }>(
        `
        SELECT is_admin
        FROM users
        WHERE telegram_id = $1
        LIMIT 1
        `,
        [telegramId]
    );

    return Boolean(result.rows[0]?.is_admin);
}
