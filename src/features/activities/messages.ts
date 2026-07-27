import { User } from './types';
import { DISTANCE_BASED_ACTIVITIES, verbsByActivity, emojiByActivity, rankSystem } from './constants';
import { formatTime, calculatePace } from './formatters';
import { getActivityType } from './helpers';

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

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

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
        return `*Скорость*: ${calculateSpeed(movingTime, distance)}`;
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
            `*Продолжительность*: ${formatTime(movingTime)}`,
            `*Калории*: ${(activity.calories ?? 0).toFixed(0)} ккал`,
        ];
    }

    const effortMetric = hasDistance ? getEffortMetric(activityType, movingTime, distance) : null;
    const elevationGain = activity.total_elevation_gain ? `*Набор*: ${activity.total_elevation_gain.toFixed(0)} м` : null;

    return [
        `*Дистанция*: ${formatDistance(distance)}`,
        `*Время*: ${formatTime(movingTime)}`,
        effortMetric,
        elevationGain,
    ].filter((line): line is string => Boolean(line));
}

export function prepareActivityMessage({ activity, user, newLevel }: { activity: any; user: User; newLevel: number }): string {
    const activityType = getActivityType(activity);
    const activityName = activity.name ?? 'Untitled activity';
    const verbs = verbsByActivity[activityType] ?? verbsByActivity.default;
    const activityEmoji = emojiByActivity[activityType] ?? emojiByActivity.default;
    const randomNumber = Math.floor(Math.random() * verbs.length);
    const randomVerb = verbs[randomNumber];
    const header = `${activityEmoji} ${rankSystem[newLevel]} *${escapeMarkdown(user.username.replaceAll('_', ' '))}* ${randomVerb}`;

    return [header, '', `*${escapeMarkdown(activityName)}*`, ...getActivityStats(activity, activityType)].join('\n');
}
