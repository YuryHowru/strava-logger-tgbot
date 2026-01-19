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
}): Promise<{ earnedXp: number; newLevel: number; nextLevelRequiredXp: number }> {
    const baseXp = calculateEarnedXp(activity, xpMultiplier);
    const earnedXp = baseXp + beautifulBonusXp;

    log('LOGIC', `Total Earned XP: ${earnedXp} (Base: ${baseXp} + Bonus: ${beautifulBonusXp})`);

    const newXp = user.xp + earnedXp;
    const newLevelInfo = await findLevelInDb(newXp);

    return { earnedXp: earnedXp, newLevel: newLevelInfo.level, nextLevelRequiredXp: newLevelInfo.total_required_xp };
}

export function prepareGamifyMessage({ user, earnedXp, newLevel, nextLevelRequiredXp, xpMultiplier }: { user: User; earnedXp: number; newLevel: number; nextLevelRequiredXp: number; xpMultiplier: number }): string {
    if (user.level === MAX_LVL) {
        return `Легенда.`;
    }

    const newXp = user.xp + earnedXp;
    let multiMessage = '';
    if (xpMultiplier > 1) multiMessage = ` (*${xpMultiplier.toFixed(2)}x*)`;
    const levelUpMessage =
        newLevel > user.level ? `🎉 ${user.username.replaceAll('_', ' ')} теперь *${rankSystem[newLevel]}* 🚀\n` : '';

    let message = '';
    if (levelUpMessage) message += levelUpMessage + '\n';
    message += `
🔥 +*${earnedXp}* XP${multiMessage}
🏆 Прогресс: ${newXp}/${nextLevelRequiredXp} XP
  `;

    return message;
}

export function prepareAddXpMessage({ user, xpToAdd, newLevel, nextLevelRequiredXp }: { user: User; xpToAdd: number; newLevel: number; nextLevelRequiredXp: number }): string {
    if (user.level === MAX_LVL) {
        return `Lvl ${MAX_LVL}. (Max level reached)`;
    }

    const newXp = user.xp + xpToAdd;
    const levelUpMessage = newLevel > user.level ? `🎉 🚀 Поднимается до уровня: ` : '';

    return `
    🔥 ${user.username} получает +${xpToAdd} XP! А так можно было?
    🏆 ${levelUpMessage} ${rankSystem[newLevel]}, ${newXp}/${nextLevelRequiredXp} XP
  `;
}

export { getBeautifulStatus };

