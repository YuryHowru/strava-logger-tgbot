import { DISTANCE_BASED_ACTIVITIES, XP_CONFIG } from './constants';
import { log } from '../../shared/logger';
import { User } from './types';

export function calculateEarnedXp(activity: any, xpMultiplier: number): number {
    const { type, distance, calories } = activity;
    const xpPerUnit = XP_CONFIG[type] ?? XP_CONFIG.default;
    log('LOGIC', `Calculating XP for type: ${type}, XP/Unit: ${xpPerUnit}, Multiplier: ${xpMultiplier}`);

    let calculated = 0;
    if (DISTANCE_BASED_ACTIVITIES.includes(type)) {
        calculated = Math.floor((distance / 1000) * xpPerUnit * xpMultiplier);
        log('LOGIC', `XP Calculation (Distance): ${distance}m -> ${calculated} XP`);
    } else {
        calculated = Math.floor((calories / 100) * xpPerUnit * xpMultiplier);
        log('LOGIC', `XP Calculation (Calories): ${calories} kcal -> ${calculated} XP`);
    }
    return calculated;
}

export function getBeautifulStatus(activity: any): { beautifulBonusXp: number; beautifulBonusMessage: string | null } {
    let bonusXp = 0;
    const messages: string[] = [];

    if (activity.distance && activity.distance > 0) {
        const km = activity.distance / 1000;
        const kmStr = km.toFixed(2);
        const [intPart, decPart] = kmStr.split('.');

        if (decPart === '00') {
            bonusXp += 20;
            messages.push('🎯 Снайпер! Ровная дистанция (+20 XP)');
            log('LOGIC', `Bonus: Sniper (${kmStr} km)`);
        } else if (intPart === decPart || (intPart.length === 1 && decPart[0] === intPart && decPart[1] === intPart)) {
            bonusXp += 30;
            messages.push(`💎 Магия чисел (${kmStr} км) (+30 XP)`);
            log('LOGIC', `Bonus: Magic Numbers (${kmStr} km)`);
        }
    }

    if (activity.moving_time && activity.moving_time > 0) {
        const minutes = Math.floor((activity.moving_time % 3600) / 60);
        const seconds = activity.moving_time % 60;

        if (seconds === 0 && minutes > 0) {
            bonusXp += 15;
            messages.push('⌚️ Ровное время! (+15 XP)');
            log('LOGIC', `Bonus: Pedant (${minutes} min)`);
        }
        // Паттерн: Синхронизация -> 12:12, 44:44
        else if (minutes === seconds && minutes !== 0) {
            bonusXp += 15;
            messages.push(`⏱ Синхронизация времени ${minutes}:${seconds} ! (+15 XP)`);
            log('LOGIC', `Bonus: Sync Time (${minutes}:${seconds})`);
        }
    }

    if (activity.calories && activity.calories > 0) {
        const cal = Math.round(activity.calories);
        const calStr = cal.toString();

        if (cal % 100 === 0) {
            bonusXp += 20;
            messages.push(`🍔 Ровный аппетит (${cal} ккал) (+20 XP)`);
            log('LOGIC', `Bonus: Appetite (${cal} kcal)`);
        } else if (cal > 10 && calStr.split('').every((char) => char === calStr[0])) {
            bonusXp += 40;
            messages.push(`🎰 Калорийный джекпот (${cal} ккал) (+40 XP)`);
            log('LOGIC', `Bonus: Jackpot (${cal} kcal)`);
        }
    }

    return {
        beautifulBonusXp: bonusXp,
        beautifulBonusMessage: messages.length > 0 ? messages.join('\n') : null,
    };
}

export function getStreakData(user: User, activityDate: number) {
    const today = new Date(activityDate * 1000);
    today.setHours(0, 0, 0, 0);

    const FIXED_MULTIPLIER = 1.25;

    let newStreak = 1;
    let xpMultiplier = 1;

    let streakMessage = `
🚀 Серия тренировок - 1 день.
Продолжив завтра, получишь бонус *${FIXED_MULTIPLIER}x*!
    `;

    const getDaysWord = (num: number) => {
        if (num >= 5 && num <= 20) return 'дней';
        const lastDigit = num % 10;
        if (lastDigit === 1) return 'день';
        if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
        return 'дней';
    };

    if (!user.last_activity) {
        log('LOGIC', 'First activity ever for user. No streak bonus.');
        return { streakMessage, xpMultiplier, newStreak };
    }

    const lastDate = new Date(user.last_activity);
    lastDate.setHours(0, 0, 0, 0);
    const dayDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    log('LOGIC', `Day difference: ${dayDifference}`);

    if (dayDifference > 1) {
        log('LOGIC', 'Streak lost (difference > 1 day). Resetting to 1.');
        return { streakMessage, xpMultiplier, newStreak };
    }

    if (dayDifference === 1) {
        newStreak = user.streak_count + 1;
        xpMultiplier = FIXED_MULTIPLIER;

        log('LOGIC', `Streak maintained! New streak: ${newStreak}, Multiplier: ${xpMultiplier}`);

        streakMessage = `
💥 Серия тренировок — *${newStreak} ${getDaysWord(newStreak)} подряд*!!
Активен бонус серии: *${FIXED_MULTIPLIER}x* к XP!
        `;
        return { streakMessage, xpMultiplier, newStreak };
    }

    // Если тренировка в тот же день (кейс 3)
    if (dayDifference === 0) {
        newStreak = user.streak_count;
        // Если серия уже была накоплена (>1 дня), бонус действует и на вторую тренировку за день
        xpMultiplier = newStreak > 1 ? FIXED_MULTIPLIER : 1;

        log('LOGIC', `Same day activity. Keeping streak: ${newStreak}. Multiplier active: ${xpMultiplier > 1}`);

        streakMessage = `
💪 Легенда. Несколько тренировок в один день.
${
    newStreak > 1
        ? `Бонус серии *${FIXED_MULTIPLIER}x* всё ещё работает!`
        : `Продолжай завтра, чтобы получить бонус *${FIXED_MULTIPLIER}x*!`
}
        `;
        return { streakMessage, xpMultiplier, newStreak };
    }

    // fallback (negative diff? timezone issues?)
    log('LOGIC', 'Fallback streak case hit');
    return { streakMessage, xpMultiplier, newStreak };
}


