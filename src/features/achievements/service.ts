import type { ActivityEvent, User } from '../activities/types';
import { getActivityType, getActivityLocalHour } from '../activities/helpers';
import { hasSniperDistance } from '../activities/calculations';
import { badgeDefinitionMap } from './catalog';
import type { BadgeKey, ChallengeWinnerBadge, UserAchievement } from './types';

type ActivityBadgeContext = {
    userBefore: User;
    userAfter: User;
    activity: any;
    activityEvent: ActivityEvent;
    totalActivitiesOnDate: number;
    totalWeightTrainingOnDate: number;
};

export function getActivityBadgeCandidates({
    userBefore,
    userAfter,
    activity,
    activityEvent,
    totalActivitiesOnDate,
    totalWeightTrainingOnDate,
}: ActivityBadgeContext): BadgeKey[] {
    const badgeKeys: BadgeKey[] = [];
    const activityType = getActivityType(activity);
    const localHour = getActivityLocalHour(activity);
    const distanceKm = (activity.distance ?? 0) / 1000;
    const calories = activity.calories ?? 0;
    const movingTime = activity.moving_time ?? 0;

    if (!userBefore.last_activity) {
        badgeKeys.push('first_activity');
    }

    if (userBefore.streak_count < 3 && userAfter.streak_count >= 3) {
        badgeKeys.push('streak_3');
    }

    if (userBefore.streak_count < 7 && userAfter.streak_count >= 7) {
        badgeKeys.push('streak_7');
    }

    if (userBefore.level < 5 && userAfter.level >= 5) {
        badgeKeys.push('level_5');
    }

    if (userBefore.level < 10 && userAfter.level >= 10) {
        badgeKeys.push('level_10');
    }

    if (['Run', 'TrailRun'].includes(activityType) && distanceKm >= 10) {
        badgeKeys.push('run_10k');
    }

    if (['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide'].includes(activityType) && distanceKm >= 50) {
        badgeKeys.push('ride_50k');
    }

    if (totalActivitiesOnDate >= 2) {
        badgeKeys.push('double_day');
    }

    if (hasSniperDistance(activity)) {
        badgeKeys.push('sniper_distance');
    }

    if (activityType === 'WeightTraining' && movingTime >= 3600) {
        badgeKeys.push('iron_hour');
    }

    if (activityType === 'WeightTraining' && calories >= 500) {
        badgeKeys.push('calorie_furnace');
    }

    if (activityType === 'WeightTraining' && totalWeightTrainingOnDate >= 2) {
        badgeKeys.push('double_pump');
    }

    if (localHour < 6) {
        badgeKeys.push('sunrise_hunter');
    }

    if (localHour >= 22) {
        badgeKeys.push('night_shift');
    }

    return badgeKeys;
}

export function getChallengeBadgeCandidates(victoriesCount: number): BadgeKey[] {
    const badgeKeys: BadgeKey[] = [];

    if (victoriesCount === 1) {
        badgeKeys.push('challenge_champion');
    }

    if (victoriesCount === 3) {
        badgeKeys.push('triple_crown');
    }

    return badgeKeys;
}

export function formatUnlockedBadges(badgeKeys: BadgeKey[]): string {
    if (!badgeKeys.length) {
        return '';
    }

    const lines = badgeKeys.map((badgeKey) => {
        const badge = badgeDefinitionMap[badgeKey];
        return `🏅 *${badge.title}* — ${badge.description}`;
    });

    return `\n🏅 *Новые бейджи*\n${lines.join('\n')}`;
}

export function prepareBadgesListMessage(
    username: string,
    achievements: UserAchievement[],
    challengeWinnerBadges: ChallengeWinnerBadge[] = []
): string {
    if (!achievements.length && !challengeWinnerBadges.length) {
        return `🏅 *${username.replaceAll('_', ' ')}*, у тебя пока нет бейджей. Пора исправлять.`;
    }

    const regularItems = achievements.map((achievement, index) => {
        const badge = badgeDefinitionMap[achievement.badge_key];
        return `${index + 1}. *${badge.title}* — ${badge.description}`;
    });
    const challengeItems = challengeWinnerBadges.map(
        (badge, index) => `${regularItems.length + index + 1}. 🏆 *Победитель челленджа: ${badge.challenge_title}*`
    );

    return `🏅 *Бейджи ${username.replaceAll('_', ' ')}*\n\n${[...regularItems, ...challengeItems].join('\n')}`;
}
