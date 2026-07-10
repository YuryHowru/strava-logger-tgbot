import { User } from './types';
import { verbsByActivity, emojiByActivity, rankSystem } from './constants';
import { formatTime, calculatePace } from './formatters';
import { getActivityType } from './helpers';

export function prepareActivityMessage({ activity, user, newLevel }: { activity: any; user: User; newLevel: number }): string {
    const activityType = getActivityType(activity);
    const activityName = activity.name;
    const movingTime = formatTime(activity.moving_time ?? 0);
    const verbs = verbsByActivity[activityType] ?? verbsByActivity.default;
    const activityEmoji = emojiByActivity[activityType] ?? emojiByActivity.default;
    const randomNumber = Math.floor(Math.random() * verbs.length);
    const randomVerb = verbs[randomNumber];

    if (activity.distance) {
        const distanceKm = (activity.distance / 1000).toFixed(2);

        const elevationGain = activity.total_elevation_gain ? activity.total_elevation_gain.toFixed(2) : '0';
        const pace = calculatePace(activity.moving_time, activity.distance);
        return `
        ${activityEmoji} ${rankSystem[newLevel]} *${user.username.replaceAll('_', ' ')}* ${randomVerb}

        *${activityName}*
        *Дистанция*: ${distanceKm} км
        *Время*: ${movingTime}
        *Темп*: ${pace} мин/км 🔥
        *В горку*: ${elevationGain} метров
    `;
    }

    return `
      ${activityEmoji} ${rankSystem[newLevel]} *${user.username.replaceAll('_', ' ')}* ${randomVerb}

      *${activityName}*
      *Продолжительность*: ${movingTime}
      *Потраченные калории*: ${(activity.calories ?? 0).toFixed(2)} ккал
    `;
}
