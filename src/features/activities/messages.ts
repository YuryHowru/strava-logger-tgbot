import { User } from './types';
import { DISTANCE_BASED_ACTIVITIES, verbsByActivity, emojiByActivity } from './constants';
import { formatTime, calculatePace } from './formatters';
import { getActivityType } from './helpers';
import { escapeMarkdown, formatRankTitle } from '../prestige/messages';

const PACE_ACTIVITIES = ['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'];
const SPEED_ACTIVITIES = [
    'Ride',
    'MountainBikeRide',
    'GravelRide',
    'E-BikeRide',
    'VirtualRide',
    'Rowing',
    'Kayak',
    'StandUpPaddling',
    'AlpineSki',
    'BackcountrySki',
    'NordicSki',
    'Snowboard',
    'IceSkate',
    'InlineSkate',
];
const SWIM_ACTIVITIES = ['Swim', 'PoolSwim'];

function formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} км` : `${Math.round(meters)} м`;
}

function calculateSpeed(movingTime: number, distance: number): string {
    if (movingTime <= 0 || distance <= 0) {
        return 'N/A';
    }

    return `${((distance / 1000) / (movingTime / 3600)).toFixed(1)} км/ч`;
}

function calculateSwimPace(movingTime: number, distance: number): string {
    if (movingTime <= 0 || distance <= 0) {
        return 'N/A';
    }

    const secondsPer100m = movingTime / (distance / 100);
    const mins = Math.floor(secondsPer100m / 60);
    const secs = Math.floor(secondsPer100m % 60).toString().padStart(2, '0');

    return `${mins}:${secs} /100м`;
}

function getEffortMetric(activityType: string, movingTime: number, distance: number): string | null {
    if (PACE_ACTIVITIES.includes(activityType)) {
        return `*Темп*: ${calculatePace(movingTime, distance)} мин/км 🔥`;
    }

    if (SWIM_ACTIVITIES.includes(activityType)) {
        return `*Темп*: ${calculateSwimPace(movingTime, distance)}`;
    }

    if (SPEED_ACTIVITIES.includes(activityType)) {
        return `*Средняя*: ${calculateSpeed(movingTime, distance)}`;
    }

    return null;
}

function getActivityStats(activity: any, activityType: string): string[] {
    const movingTime = activity.moving_time ?? 0;
    const distance = activity.distance ?? 0;
    const hasDistance = distance > 0;
    const isDistanceActivity = hasDistance || DISTANCE_BASED_ACTIVITIES.includes(activityType);

    if (!isDistanceActivity) {
        return [
            `*Длительность*: ${formatTime(movingTime)}`,
            `*Энергия*: ${(activity.calories ?? 0).toFixed(0)} ккал`,
        ];
    }

    const effortMetric = hasDistance ? getEffortMetric(activityType, movingTime, distance) : null;
    const elevationGain = activity.total_elevation_gain ? `*Подъём*: ${activity.total_elevation_gain.toFixed(0)} м` : null;

    return [
        `*Маршрут*: ${formatDistance(distance)}`,
        `*Длительность*: ${formatTime(movingTime)}`,
        effortMetric,
        elevationGain,
    ].filter((line): line is string => Boolean(line));
}

export function prepareActivityMessage({ activity, user, newLevel }: { activity: any; user: User; newLevel: number }): string {
    const activityType = getActivityType(activity);
    const activityName = activity.name ?? 'Без названия';
    const verbs = verbsByActivity[activityType] ?? verbsByActivity.default;
    const activityEmoji = emojiByActivity[activityType] ?? emojiByActivity.default;
    const randomNumber = Math.floor(Math.random() * verbs.length);
    const randomVerb = verbs[randomNumber];
    const header = `${activityEmoji} ${formatRankTitle(newLevel, user.prestige_level)} *${escapeMarkdown(user.username.replaceAll('_', ' '))}* ${randomVerb}`;

    return [header, '', `*${escapeMarkdown(activityName)}*`, ...getActivityStats(activity, activityType)].join('\n');
}
