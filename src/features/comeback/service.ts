import {
    completeComebackCampaign,
    createComebackCampaign,
    expireUserComebackCampaigns,
    getActiveComebackCampaign,
    grantUserXpOnce,
    hasRecentComebackCampaign,
    insertUserAchievements,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { ActivityEvent, User } from '../activities/types';
import type { BadgeKey } from '../achievements/types';
import { prepareComebackCompletedMessage, prepareComebackStartedMessage } from './messages';
import type { ComebackResult } from './types';

const COMEBACK_REWARD_XP = 200;
const COMEBACK_WINDOW_DAYS = 3;
const COMEBACK_COOLDOWN_DAYS = 30;

function getStartOfDay(date: Date): Date {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    return start;
}

function getDaysBetween(start: Date, end: Date): number {
    return Math.floor((getStartOfDay(end).getTime() - getStartOfDay(start).getTime()) / 86400000);
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86400000);
}

function getComebackBadgeCandidates(inactivityDays: number): BadgeKey[] {
    if (inactivityDays >= 30) {
        return ['comeback_7', 'comeback_14', 'comeback_30'];
    }

    if (inactivityDays >= 14) {
        return ['comeback_7', 'comeback_14'];
    }

    return ['comeback_7'];
}

async function completeActiveComeback({
    user,
    activityEvent,
    db,
}: {
    user: User;
    activityEvent: ActivityEvent;
    db: Queryable;
}): Promise<ComebackResult | null> {
    const activeCampaign = await getActiveComebackCampaign(user.id, db);
    if (!activeCampaign || activeCampaign.trigger_activity_event_id === activityEvent.id) {
        return null;
    }

    if (activeCampaign.expires_at < activityEvent.started_at_utc) {
        await expireUserComebackCampaigns(user.id, activityEvent.started_at_utc, db);
        return null;
    }

    const completed = await completeComebackCampaign(activeCampaign.id, activityEvent.id, activityEvent.started_at_utc, db);
    if (!completed) {
        return null;
    }

    await grantUserXpOnce(
        {
            userId: user.id,
            grantType: 'comeback_completed',
            periodKey: `comeback-${completed.id}`,
            xp: completed.reward_xp,
            reason: 'Камбэк-миссия',
        },
        db
    );

    return {
        message: prepareComebackCompletedMessage(completed.reward_xp),
        unlockedBadgeKeys: [],
    };
}

async function startComebackIfEligible({
    user,
    activityEvent,
    db,
}: {
    user: User;
    activityEvent: ActivityEvent;
    db: Queryable;
}): Promise<ComebackResult | null> {
    if (!user.last_activity) {
        return null;
    }

    const inactivityDays = getDaysBetween(user.last_activity, activityEvent.started_at_utc);
    if (inactivityDays < 7) {
        return null;
    }

    const cooldownStart = addDays(activityEvent.started_at_utc, -COMEBACK_COOLDOWN_DAYS);
    const hasRecentCampaign = await hasRecentComebackCampaign(user.id, cooldownStart, db);
    if (hasRecentCampaign) {
        return null;
    }

    const campaign = await createComebackCampaign(
        {
            userId: user.id,
            triggerActivityEventId: activityEvent.id,
            inactivityDays,
            rewardXp: COMEBACK_REWARD_XP,
            expiresAt: addDays(activityEvent.started_at_utc, COMEBACK_WINDOW_DAYS),
        },
        db
    );

    if (!campaign) {
        return null;
    }

    const unlockedBadgeKeys = await insertUserAchievements(user.id, getComebackBadgeCandidates(inactivityDays), db);

    return {
        message: prepareComebackStartedMessage(inactivityDays),
        unlockedBadgeKeys: unlockedBadgeKeys.filter((badgeKey) =>
            ['comeback_7', 'comeback_14', 'comeback_30'].includes(badgeKey)
        ) as ComebackResult['unlockedBadgeKeys'],
    };
}

export async function processComebackCampaign({
    user,
    activityEvent,
    db,
}: {
    user: User;
    activityEvent: ActivityEvent;
    db: Queryable;
}): Promise<ComebackResult> {
    await expireUserComebackCampaigns(user.id, activityEvent.started_at_utc, db);

    const completed = await completeActiveComeback({ user, activityEvent, db });
    if (completed) {
        return completed;
    }

    const started = await startComebackIfEligible({ user, activityEvent, db });
    return started ?? { message: null, unlockedBadgeKeys: [] };
}
