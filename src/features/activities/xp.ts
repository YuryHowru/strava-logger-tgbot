import { User } from './types';
import { MAX_LVL } from './constants';
import { calculateEarnedXp, getBeautifulStatus } from './calculations';
import { findLevelInDb } from '../../infrastructure/database/service';
import { log } from '../../shared/logger';
import { formatRankTitle, formatUserName, prepareMaxLevelPrestigeMessage } from '../prestige/messages';

export type XpReward = {
    label: string;
    xp: number;
    note?: string;
};

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
}): Promise<{
    earnedXp: number;
    baseXp: number;
    appliedBeautifulBonusXp: number;
    newLevel: number;
    nextLevelRequiredXp: number;
    xpWasCapped: boolean;
}> {
    const baseXp = calculateEarnedXp(activity, xpMultiplier);
    const rawEarnedXp = baseXp + beautifulBonusXp;

    log('LOGIC', `Total Earned XP before cap: ${rawEarnedXp} (Base: ${baseXp} + Bonus: ${beautifulBonusXp})`);

    if (user.level >= MAX_LVL) {
        return {
            earnedXp: 0,
            baseXp: 0,
            appliedBeautifulBonusXp: 0,
            newLevel: MAX_LVL,
            nextLevelRequiredXp: user.xp,
            xpWasCapped: true,
        };
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
        baseXp: Math.min(baseXp, earnedXp),
        appliedBeautifulBonusXp: Math.max(0, earnedXp - baseXp),
        newLevel: newLevelInfo.level,
        nextLevelRequiredXp: newLevelInfo.total_required_xp,
        xpWasCapped,
    };
}

export function prepareXpSummaryMessage({
    user,
    rewards,
    newLevel,
    nextLevelRequiredXp,
    finalXp,
}: {
    user: User;
    rewards: XpReward[];
    newLevel: number;
    nextLevelRequiredXp: number;
    finalXp: number;
}): string {
    const visibleRewards = rewards.filter((reward) => reward.xp > 0);
    const totalXp = visibleRewards.reduce((total, reward) => total + reward.xp, 0);

    if (totalXp <= 0) {
        return '';
    }

    const levelUpMessage =
        newLevel > user.level ? `🎉 ${formatUserName(user)} получает ранг *${formatRankTitle(newLevel, user.prestige_level)}* 🚀\n` : '';

    return [
        levelUpMessage.trim(),
        '🔥 *XP*',
        ...visibleRewards.map((reward) => `${reward.label}: +${reward.xp} XP${reward.note ? ` ${reward.note}` : ''}`),
        '',
        `Итого: +*${totalXp}* XP`,
        `🏆 Сейчас: ${finalXp}/${nextLevelRequiredXp} XP`,
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

    const maxLevelMessage = user.level < MAX_LVL && newLevel >= MAX_LVL ? `\n${prepareMaxLevelPrestigeMessage()}` : '';

    return `
    🔥 ${user.username} забирает +${xpToAdd} XP.
    🏆 ${levelUpMessage} ${formatRankTitle(newLevel, user.prestige_level)}, ${newXp}/${nextLevelRequiredXp} XP
    ${maxLevelMessage}
  `;
}

export { getBeautifulStatus };
