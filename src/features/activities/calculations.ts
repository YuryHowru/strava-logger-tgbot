import { DISTANCE_BASED_ACTIVITIES, XP_CONFIG } from './constants';
import { log } from '../../shared/logger';
import { User } from './types';
import { getActivityType } from './helpers';

export function calculateEarnedXp(activity: any, xpMultiplier: number): number {
    const type = getActivityType(activity);
    const { distance = 0, calories = 0 } = activity;
    const xpPerUnit = XP_CONFIG[type] ?? XP_CONFIG.default;
    log('LOGIC', `Calculating XP for type: ${type}, XP/Unit: ${xpPerUnit}, Multiplier: ${xpMultiplier}`);

    if (DISTANCE_BASED_ACTIVITIES.includes(type)) {
        const calculated = Math.floor((distance / 1000) * xpPerUnit * xpMultiplier);
        log('LOGIC', `XP Calculation (Distance): ${distance}m -> ${calculated} XP`);
        return calculated;
    } else {
        const calculated = Math.floor((calories / 100) * xpPerUnit * xpMultiplier);
        log('LOGIC', `XP Calculation (Calories): ${calories} kcal -> ${calculated} XP`);
        return calculated;
    }
}

export function hasSniperDistance(activity: any): boolean {
    if (!activity.distance || activity.distance <= 0) {
        return false;
    }

    const km = activity.distance / 1000;
    return km.toFixed(2).endsWith('.00');
}

export function getBeautifulStatus(activity: any): { beautifulBonusXp: number; beautifulBonusMessage: string | null } {
    const bonuses = [
        ...getDistanceBonuses(activity),
        ...getMovingTimeBonuses(activity),
        ...getCalorieBonuses(activity),
    ];

    return {
        beautifulBonusXp: bonuses.reduce((total, bonus) => total + bonus.xp, 0),
        beautifulBonusMessage: bonuses.length > 0 ? bonuses.map((bonus) => bonus.message).join('\n') : null,
    };
}

function getDistanceBonuses(activity: any): Array<{ xp: number; message: string }> {
    if (!activity.distance || activity.distance <= 0) {
        return [];
    }

    const km = activity.distance / 1000;
    const kmStr = km.toFixed(2);
    const [intPart, decPart] = kmStr.split('.');

    if (hasSniperDistance(activity)) {
        log('LOGIC', `Bonus: Sniper (${kmStr} km)`);
        return [{ xp: 20, message: '🎯 Снайпер! Ровная дистанция (+20 XP)' }];
    }

    const isMagicNumber = intPart === decPart || (intPart.length === 1 && decPart[0] === intPart && decPart[1] === intPart);
    if (!isMagicNumber) {
        return [];
    }

    log('LOGIC', `Bonus: Magic Numbers (${kmStr} km)`);
    return [{ xp: 30, message: `💎 Магия чисел (${kmStr} км) (+30 XP)` }];
}

function getMovingTimeBonuses(activity: any): Array<{ xp: number; message: string }> {
    if (!activity.moving_time || activity.moving_time <= 0) {
        return [];
    }

    const minutes = Math.floor((activity.moving_time % 3600) / 60);
    const seconds = activity.moving_time % 60;

    if (seconds === 0 && minutes > 0) {
        log('LOGIC', `Bonus: Pedant (${minutes} min)`);
        return [{ xp: 15, message: '⌚️ Ровное время! (+15 XP)' }];
    }

    if (minutes === seconds && minutes !== 0) {
        log('LOGIC', `Bonus: Sync Time (${minutes}:${seconds})`);
        return [{ xp: 15, message: `⏱ Синхронизация времени ${minutes}:${seconds} ! (+15 XP)` }];
    }

    return [];
}

function getCalorieBonuses(activity: any): Array<{ xp: number; message: string }> {
    if (!activity.calories || activity.calories <= 0) {
        return [];
    }

    const calories = Math.round(activity.calories);
    const caloriesString = calories.toString();

    if (calories % 100 === 0) {
        log('LOGIC', `Bonus: Appetite (${calories} kcal)`);
        return [{ xp: 20, message: `🍔 Ровный аппетит (${calories} ккал) (+20 XP)` }];
    }

    const isJackpot = calories > 10 && caloriesString.split('').every((char) => char === caloriesString[0]);
    if (!isJackpot) {
        return [];
    }

    log('LOGIC', `Bonus: Jackpot (${calories} kcal)`);
    return [{ xp: 40, message: `🎰 Калорийный джекпот (${calories} ккал) (+40 XP)` }];
}

function getStartOfDay(timestampSeconds: number): Date {
    const date = new Date(timestampSeconds * 1000);
    date.setHours(0, 0, 0, 0);
    return date;
}

type StreakKind = 'default' | 'same_day' | 'continued';

type StreakData = {
    xpMultiplier: number;
    newStreak: number;
    kind: StreakKind;
    bonusMultiplier: number;
};

const FIXED_STREAK_MULTIPLIER = 1.25;

function createStreakData(kind: StreakKind, newStreak: number, xpMultiplier: number): StreakData {
    return {
        kind,
        newStreak,
        xpMultiplier,
        bonusMultiplier: FIXED_STREAK_MULTIPLIER,
    };
}

function getDefaultStreakMessage(multiplier: number, showXpBonus: boolean): string {
    return [
        '🚀 Серия тренировок - 1 день.',
        showXpBonus ? `Продолжив завтра, получишь бонус *${multiplier}x*!` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

function getSameDayStreakMessage(newStreak: number, multiplier: number, showXpBonus: boolean): string {
    const bonusLine = newStreak > 1
        ? `Бонус серии *${multiplier}x* всё ещё работает!`
        : `Продолжай завтра, чтобы получить бонус *${multiplier}x*!`;

    return ['💪 Легенда. Несколько тренировок в один день.', showXpBonus ? bonusLine : null].filter(Boolean).join('\n');
}

function getContinuedStreakMessage(newStreak: number, multiplier: number, showXpBonus: boolean): string {
    return [
        `💥 Серия тренировок — *${newStreak} ${getDaysWord(newStreak)} подряд*!!`,
        showXpBonus ? `Активен бонус серии: *${multiplier}x* к XP!` : null,
    ]
        .filter(Boolean)
        .join('\n');
}

function getDaysWord(num: number) {
    if (num >= 5 && num <= 20) return 'дней';
    const lastDigit = num % 10;
    if (lastDigit === 1) return 'день';
    if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
    return 'дней';
}

export function getStreakData(user: User, activityDate: number): StreakData {
    const today = getStartOfDay(activityDate);

    if (!user.last_activity) {
        log('LOGIC', 'First activity ever for user. No streak bonus.');
        return createStreakData('default', 1, 1);
    }

    const lastDate = new Date(user.last_activity);
    lastDate.setHours(0, 0, 0, 0);
    const dayDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    log('LOGIC', `Day difference: ${dayDifference}`);

    if (dayDifference > 1) {
        log('LOGIC', 'Streak lost (difference > 1 day). Resetting to 1.');
        return createStreakData('default', 1, 1);
    }

    if (dayDifference === 1) {
        const newStreak = user.streak_count + 1;

        log('LOGIC', `Streak maintained! New streak: ${newStreak}, Multiplier: ${FIXED_STREAK_MULTIPLIER}`);

        return createStreakData('continued', newStreak, FIXED_STREAK_MULTIPLIER);
    }

    if (dayDifference === 0) {
        const newStreak = user.streak_count;
        const xpMultiplier = newStreak > 1 ? FIXED_STREAK_MULTIPLIER : 1;

        log('LOGIC', `Same day activity. Keeping streak: ${newStreak}. Multiplier active: ${xpMultiplier > 1}`);
        return createStreakData('same_day', newStreak, xpMultiplier);
    }

    log('LOGIC', 'Fallback streak case hit');
    return createStreakData('default', 1, 1);
}

export function formatStreakMessage(
    streak: Pick<StreakData, 'kind' | 'newStreak' | 'bonusMultiplier'>,
    showXpBonus: boolean
): string {
    if (streak.kind === 'continued') {
        return getContinuedStreakMessage(streak.newStreak, streak.bonusMultiplier, showXpBonus);
    }

    if (streak.kind === 'same_day') {
        return getSameDayStreakMessage(streak.newStreak, streak.bonusMultiplier, showXpBonus);
    }

    return getDefaultStreakMessage(streak.bonusMultiplier, showXpBonus);
}
