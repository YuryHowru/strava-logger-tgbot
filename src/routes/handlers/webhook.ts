import { pool } from '../../infrastructure/database/config';
import {
    countUserActivitiesByTypeOnDate,
    countUserActivitiesOnDate,
    createActivityEvent,
    getActiveChallengeByChatId,
    getChallengeStandings,
    getUserByAthleteId,
    insertUserAchievements,
    isChallengeParticipant,
    updateUserStats,
} from '../../infrastructure/database/service';
import { getBot } from '../../infrastructure/bot/config';
import { getFullActivityInfo } from '../../infrastructure/strava/service';
import { getActivityBadgeCandidates, formatUnlockedBadges } from '../../features/achievements/service';
import type { BadgeKey } from '../../features/achievements/types';
import { getBeautifulStatus, getStreakData } from '../../features/activities/calculations';
import { getActivityLocalDate, getActivityStartLocal, getActivityStartUtc, getActivityType } from '../../features/activities/helpers';
import { prepareActivityMessage } from '../../features/activities/messages';
import type { User } from '../../features/activities/types';
import { calculateLevelInfo, prepareGamifyMessage } from '../../features/activities/xp';
import { refreshUserToken } from '../../features/auth/service';
import { prepareChallengeProgressMessage } from '../../features/challenges/messages';
import { finalizeChallenge, isChallengeExpired } from '../../features/challenges/service';
import { errorLog, log } from '../../shared/logger';
import { PoolClient } from 'pg';

type WebhookRequest = {
    body: {
        object_type?: string;
        object_id?: number;
        aspect_type?: string;
        owner_id?: number;
        event_time?: number;
    };
};

type WebhookResponse = {
    status: (code: number) => { send: (body: unknown) => void };
};

type ActivityProcessingResult = {
    earnedXp: number;
    newLevel: number;
    nextLevelRequiredXp: number;
    streakMessage: string;
    xpMultiplier: number;
    beautifulBonusMessage: string | null;
    unlockedBadgeKeys: BadgeKey[];
    challengeProgressMessage: string;
    challengeAnnouncement: string | null;
};

function isCreateActivityEvent(body: WebhookRequest['body']): body is {
    object_type: string;
    object_id: number;
    aspect_type: string;
    owner_id: number;
    event_time: number;
} {
    return Boolean(
        body.object_type === 'activity' &&
            body.aspect_type === 'create' &&
            typeof body.object_id === 'number' &&
            typeof body.owner_id === 'number' &&
            typeof body.event_time === 'number'
    );
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getWebhookUser(ownerId: number): Promise<User | null> {
    const user = await getUserByAthleteId(ownerId);

    if (!user) {
        errorLog('WEBHOOK', `User with athleteId ${ownerId} not found in DB`, null);
    }

    return user;
}

async function refreshUserTokenIfNeeded(user: User): Promise<void> {
    if (user.expiresat <= new Date()) {
        await refreshUserToken(user);
    }
}

async function getWebhookActivity(user: User, activityId: number): Promise<any> {
    const activity = await getFullActivityInfo({ activityId, userAccessToken: user.accesstoken });
    log('WEBHOOK', `Activity details fetched. Type: ${getActivityType(activity)}, Name: ${activity.name}`);
    return activity;
}

async function getActivityProgress(user: User, activity: any, eventTime: number) {
    const { streakMessage, newStreak, xpMultiplier } = getStreakData(user, eventTime);
    const { beautifulBonusXp, beautifulBonusMessage } = getBeautifulStatus(activity);
    const { newLevel, earnedXp, nextLevelRequiredXp } = await calculateLevelInfo({
        activity,
        user,
        xpMultiplier,
        beautifulBonusXp,
    });

    return {
        streakMessage,
        newStreak,
        xpMultiplier,
        beautifulBonusMessage,
        newLevel,
        earnedXp,
        nextLevelRequiredXp,
    };
}

function getActivityEventPayload(user: User, activity: any, activityId: number, earnedXp: number) {
    return {
        strava_activity_id: activityId,
        user_id: user.id,
        chat_id: String(user.chatid),
        activity_type: getActivityType(activity),
        activity_name: activity.name ?? 'Untitled activity',
        distance_m: activity.distance ?? null,
        moving_time_s: activity.moving_time ?? null,
        calories: activity.calories ?? null,
        earned_xp: earnedXp,
        started_at_utc: getActivityStartUtc(activity),
        started_at_local: getActivityStartLocal(activity),
        local_activity_date: getActivityLocalDate(activity),
    };
}

async function getUnlockedBadges({
    client,
    user,
    userAfter,
    activity,
    activityEvent,
}: {
    client: any;
    user: User;
    userAfter: User;
    activity: any;
    activityEvent: Awaited<ReturnType<typeof createActivityEvent>>;
}) {
    const [totalActivitiesOnDate, totalWeightTrainingOnDate] = await Promise.all([
        countUserActivitiesOnDate(user.id, activityEvent!.local_activity_date, client),
        countUserActivitiesByTypeOnDate(user.id, 'WeightTraining', activityEvent!.local_activity_date, client),
    ]);

    const badgeCandidates = getActivityBadgeCandidates({
        userBefore: user,
        userAfter,
        activity,
        activityEvent: activityEvent!,
        totalActivitiesOnDate,
        totalWeightTrainingOnDate,
    });

    return insertUserAchievements(user.id, badgeCandidates, client);
}

async function getChallengeUpdate({
    client,
    chatId,
    userId,
}: {
    client: any;
    chatId: string;
    userId: number;
}): Promise<{ challengeProgressMessage: string; challengeAnnouncement: string | null }> {
    const activeChallenge = await getActiveChallengeByChatId(chatId, client);
    if (!activeChallenge) {
        return { challengeProgressMessage: '', challengeAnnouncement: null };
    }

    if (isChallengeExpired(activeChallenge)) {
        const result = await finalizeChallenge({
            challenge: activeChallenge,
            status: 'finished',
            db: client,
        });

        return {
            challengeProgressMessage: '',
            challengeAnnouncement: result.announcement,
        };
    }

    const isParticipant = await isChallengeParticipant(activeChallenge.id, userId, client);
    if (!isParticipant) {
        return { challengeProgressMessage: '', challengeAnnouncement: null };
    }

    const standings = await getChallengeStandings(activeChallenge, client);
    return {
        challengeProgressMessage: prepareChallengeProgressMessage(activeChallenge, standings, userId),
        challengeAnnouncement: null,
    };
}

async function processActivityUpdate({
    user,
    activity,
    activityId,
    eventTime,
}: {
    user: User;
    activity: any;
    activityId: number;
    eventTime: number;
}): Promise<ActivityProcessingResult | null> {
    const progress = await getActivityProgress(user, activity, eventTime);
    const newXp = user.xp + progress.earnedXp;
    const activityEventPayload = getActivityEventPayload(user, activity, activityId, progress.earnedXp);
    const userAfter = {
        ...user,
        xp: newXp,
        level: progress.newLevel,
        streak_count: progress.newStreak,
        last_activity: activityEventPayload.started_at_utc,
    };

    log('WEBHOOK', `Finalizing: Earned ${progress.earnedXp} XP. New Total: ${newXp}. New Level: ${progress.newLevel}`);

    return withTransaction(async (client) => {
        const activityEvent = await createActivityEvent(activityEventPayload, client);
        if (!activityEvent) {
            log('WEBHOOK', `Duplicate activity ${activityId} ignored.`);
            return null;
        }

        await updateUserStats(
            user.id,
            newXp,
            progress.newLevel,
            Math.floor(activityEventPayload.started_at_utc.getTime() / 1000),
            progress.newStreak,
            client
        );

        const [unlockedBadgeKeys, challengeUpdate] = await Promise.all([
            getUnlockedBadges({
                client,
                user,
                userAfter,
                activity,
                activityEvent,
            }),
            getChallengeUpdate({
                client,
                chatId: String(user.chatid),
                userId: user.id,
            }),
        ]);

        return {
            earnedXp: progress.earnedXp,
            newLevel: progress.newLevel,
            nextLevelRequiredXp: progress.nextLevelRequiredXp,
            streakMessage: progress.streakMessage,
            xpMultiplier: progress.xpMultiplier,
            beautifulBonusMessage: progress.beautifulBonusMessage,
            unlockedBadgeKeys,
            challengeProgressMessage: challengeUpdate.challengeProgressMessage,
            challengeAnnouncement: challengeUpdate.challengeAnnouncement,
        };
    });
}

function buildWebhookMessage({
    activity,
    user,
    processingResult,
    activityId,
}: {
    activity: any;
    user: User;
    processingResult: ActivityProcessingResult;
    activityId: number;
}): string {
    const messageParts = [
        prepareActivityMessage({ activity, user, newLevel: processingResult.newLevel }),
        processingResult.streakMessage,
        processingResult.beautifulBonusMessage,
        prepareGamifyMessage({
            user,
            earnedXp: processingResult.earnedXp,
            newLevel: processingResult.newLevel,
            nextLevelRequiredXp: processingResult.nextLevelRequiredXp,
            xpMultiplier: processingResult.xpMultiplier,
        }),
        processingResult.challengeProgressMessage || null,
        `[Открыть в Страве](https://www.strava.com/activities/${activityId})`,
    ];

    return messageParts.filter(Boolean).join('\n');
}

async function sendWebhookMessages({
    chatId,
    mainMessage,
    unlockedBadgeKeys,
    challengeAnnouncement,
}: {
    chatId: string | number;
    mainMessage: string;
    unlockedBadgeKeys: BadgeKey[];
    challengeAnnouncement: string | null;
}): Promise<void> {
    const bot = getBot();
    await bot.telegram.sendMessage(chatId, mainMessage, { parse_mode: 'Markdown' });

    if (unlockedBadgeKeys.length > 0) {
        await bot.telegram.sendMessage(chatId, formatUnlockedBadges(unlockedBadgeKeys), { parse_mode: 'Markdown' });
    }

    if (challengeAnnouncement) {
        await bot.telegram.sendMessage(chatId, challengeAnnouncement, { parse_mode: 'Markdown' });
    }
}

async function handleWebhook(req: WebhookRequest): Promise<void> {
    const { body } = req;
    log(
        'WEBHOOK',
        `📨 Received event: ${body.object_type} / ${body.aspect_type} | ID: ${body.object_id} | Owner: ${body.owner_id}`
    );

    if (!isCreateActivityEvent(body)) {
        log('WEBHOOK', 'Event ignored (not activity creation)');
        return;
    }

    const user = await getWebhookUser(body.owner_id);
    if (!user) {
        return;
    }

    log('WEBHOOK', `Processing activity for user: ${user.username} (ID: ${user.id})`);
    await refreshUserTokenIfNeeded(user);

    const activity = await getWebhookActivity(user, body.object_id);
    const processingResult = await processActivityUpdate({
        user,
        activity,
        activityId: body.object_id,
        eventTime: body.event_time,
    });

    if (!processingResult) {
        return;
    }

    const mainMessage = buildWebhookMessage({
        activity,
        user,
        processingResult,
        activityId: body.object_id,
    });

    log('WEBHOOK', `Sending Telegram message to chat ${user.chatid}`);
    await sendWebhookMessages({
        chatId: user.chatid,
        mainMessage,
        unlockedBadgeKeys: processingResult.unlockedBadgeKeys,
        challengeAnnouncement: processingResult.challengeAnnouncement,
    });

    log('DB', 'User stats, badges and challenges updated successfully.');
}

export const webhookHandler = async (req: WebhookRequest, res: WebhookResponse) => {
    res.status(200).send('OK');

    try {
        await handleWebhook(req);
    } catch (error) {
        errorLog('WEBHOOK', 'CRITICAL ERROR in webhook handler', error);
    }
};
