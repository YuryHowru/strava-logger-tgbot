import { User } from './types';
import { verbsByActivity, emojiByActivity, rankSystem } from './constants';
import { formatTime, calculatePace } from './formatters';

export function prepareActivityMessage({ activity, user, newLevel }: { activity: any; user: User; newLevel: number }): string {
    const activityType = activity.type;
    const activityName = activity.name;
    const movingTime = formatTime(activity.moving_time);
    const verbs = verbsByActivity[activityType] ?? verbsByActivity.default;
    const randomNumber = Math.floor(Math.random() * verbs.length);
    const randomVerb = verbs[randomNumber];

    if (activity.distance) {
        const distanceKm = (activity.distance / 1000).toFixed(2);

        const elevationGain = activity.total_elevation_gain ? activity.total_elevation_gain.toFixed(2) : '0';
        const pace = calculatePace(activity.moving_time, activity.distance);
        return `
        ${emojiByActivity[activityType]} ${rankSystem[newLevel]} *${user.username.replaceAll('_', ' ')}* ${randomVerb}

        *${activityName}*
        *Дистанция*: ${distanceKm} км
        *Время*: ${movingTime}
        *Темп*: ${pace} мин/км 🔥
        *В горку*: ${elevationGain} метров
    `;
    }

    return `
      ${emojiByActivity[activityType]} ${rankSystem[newLevel]} *${user.username.replaceAll('_', ' ')}* ${randomVerb}

      *${activityName}*
      *Продолжительность*: ${movingTime}
      *Потраченные калории*: ${activity.calories.toFixed(2)} ккал
    `;
}


