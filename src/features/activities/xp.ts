import { User } from './types';
import { MAX_LVL, rankSystem } from './constants';
import { calculateEarnedXp, getBeautifulStatus } from './calculations';
import { findLevelInDb } from '../../infrastructure/database/service';
import { log } from '../../shared/logger';

export async function calculateLevelInfo({
    activity,
    user,
    xpMultiplier,
    beautifulBonusXp,
}: {
    activity: any;
    user: User;
    xpMultiplier: number;
    beautifulBonusXp: number;
}): Promise<{ earnedXp: number; newLevel: number; nextLevelRequiredXp: number; xpWasCapped: boolean }> {
    const baseXp = calculateEarnedXp(activity, xpMultiplier);
    const rawEarnedXp = baseXp + beautifulBonusXp;

    log('LOGIC', `Total Earned XP before cap: ${rawEarnedXp} (Base: ${baseXp} + Bonus: ${beautifulBonusXp})`);

    if (user.level >= MAX_LVL) {
        return { earnedXp: 0, newLevel: MAX_LVL, nextLevelRequiredXp: user.xp, xpWasCapped: true };
    }

    const rawNewXp = user.xp + rawEarnedXp;
    const newLevelInfo = await findLevelInDb(rawNewXp);
    const earnedXp =
        newLevelInfo.level >= MAX_LVL
            ? Math.max(0, Math.min(rawEarnedXp, newLevelInfo.total_required_xp - user.xp))
            : rawEarnedXp;

    const xpWasCapped = earnedXp !== rawEarnedXp;

    if (xpWasCapped) {
        log('LOGIC', `XP capped at max level: ${rawEarnedXp} -> ${earnedXp}`);
    }

    return {
        earnedXp,
        newLevel: newLevelInfo.level,
        nextLevelRequiredXp: newLevelInfo.total_required_xp,
        xpWasCapped,
    };
}

export function prepareGamifyMessage({
    user,
    earnedXp,
    newLevel,
    nextLevelRequiredXp,
    xpMultiplier,
    showXpMultiplier,
}: {
    user: User;
    earnedXp: number;
    newLevel: number;
    nextLevelRequiredXp: number;
    xpMultiplier: number;
    showXpMultiplier: boolean;
}): string {
    if (earnedXp <= 0) {
        return '';
    }

    const newXp = user.xp + earnedXp;
    const levelUpMessage =
        newLevel > user.level ? `🎉 ${user.username.replaceAll('_', ' ')} получает ранг *${rankSystem[newLevel]}* 🚀\n` : '';
    const multiMessage = showXpMultiplier && xpMultiplier > 1 ? ` (*${xpMultiplier.toFixed(2)}x*)` : '';

    return [
        levelUpMessage.trim(),
        `🔥 +*${earnedXp}* XP${multiMessage}`,
        `🏆 Сейчас: ${newXp}/${nextLevelRequiredXp} XP`,
    ]
        .filter(Boolean)
        .join('\n');
}

export function prepareAddXpMessage({ user, xpToAdd, newLevel, nextLevelRequiredXp }: { user: User; xpToAdd: number; newLevel: number; nextLevelRequiredXp: number }): string {
    if (user.level === MAX_LVL) {
        return `Lvl ${MAX_LVL}. (Max level reached)`;
    }

    const newXp = user.xp + xpToAdd;
    const levelUpMessage = newLevel > user.level ? `🎉 🚀 Новый уровень: ` : '';

    return `
    🔥 ${user.username} забирает +${xpToAdd} XP.
    🏆 ${levelUpMessage} ${rankSystem[newLevel]}, ${newXp}/${nextLevelRequiredXp} XP
  `;
}

export { getBeautifulStatus };
