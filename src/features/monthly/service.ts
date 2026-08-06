import {
    createMonthlyAward,
    getActiveChatIds,
    getMonthlyAwardCandidates,
    getMonthlyComebackCandidate,
    grantUserXpOnce,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { MonthlyAward, MonthlyAwardCandidate, MonthlyAwardType } from './types';

const MONTHLY_AWARD_REWARD_XP = 100;

const awardTitles: Record<MonthlyAwardType, string> = {
    xp_machine: '🏆 XP Machine',
    most_consistent: '🧱 Самый стабильный',
    comeback: '🔁 Камбэк месяца',
    small_steps: '🚶 Small Steps',
    random_hero: '🎲 Random Hero',
};

function pickRandom<T>(items: T[]): T | null {
    if (!items.length) {
        return null;
    }

    return items[Math.floor(Math.random() * items.length)];
}

function toAward(type: MonthlyAwardType, candidate: MonthlyAwardCandidate, value: string): MonthlyAward {
    return {
        awardType: type,
        title: awardTitles[type],
        winnerUserId: candidate.user_id,
        username: candidate.username,
        value,
        rewardXp: MONTHLY_AWARD_REWARD_XP,
    };
}

async function saveAndRewardAward(chatId: string, periodKey: string, award: MonthlyAward, db?: Queryable): Promise<MonthlyAward | null> {
    const saved = await createMonthlyAward(
        {
            chatId,
            periodKey,
            awardType: award.awardType,
            winnerUserId: award.winnerUserId,
            rewardXp: award.rewardXp,
        },
        db
    );

    if (!saved) {
        return null;
    }

    const grantedXp = await grantUserXpOnce(
        {
            userId: award.winnerUserId,
            grantType: `monthly_award_${award.awardType}`,
            periodKey: `${chatId}:${periodKey}`,
            xp: award.rewardXp,
            reason: award.title,
        },
        db
    );

    return {
        ...award,
        rewardXp: grantedXp,
    };
}

export async function buildMonthlyAwards({
    chatId,
    periodKey,
    startDate,
    endDate,
    db,
}: {
    chatId: string;
    periodKey: string;
    startDate: string;
    endDate: string;
    db?: Queryable;
}): Promise<MonthlyAward[]> {
    const [candidates, comebackCandidate] = await Promise.all([
        getMonthlyAwardCandidates(chatId, startDate, endDate, db),
        getMonthlyComebackCandidate(chatId, startDate, endDate, db),
    ]);

    if (!candidates.length) {
        return [];
    }

    const awards: MonthlyAward[] = [];
    const xpMachine = candidates[0];
    const mostConsistent = [...candidates].sort((a, b) => b.active_days - a.active_days || b.total_xp - a.total_xp)[0];
    const smallSteps = candidates.find((candidate) => candidate.activities_count >= 1 && candidate.activities_count <= 3);
    const randomHero = pickRandom(candidates);

    awards.push(toAward('xp_machine', xpMachine, `${xpMachine.total_xp} XP`));
    awards.push(toAward('most_consistent', mostConsistent, `${mostConsistent.active_days} дн.`));

    if (comebackCandidate) {
        awards.push({
            awardType: 'comeback',
            title: awardTitles.comeback,
            winnerUserId: comebackCandidate.user_id,
            username: comebackCandidate.username,
            value: `${comebackCandidate.inactivity_days} дн. паузы`,
            rewardXp: MONTHLY_AWARD_REWARD_XP,
        });
    }

    if (smallSteps) {
        awards.push(toAward('small_steps', smallSteps, `${smallSteps.activities_count} акт.`));
    }

    if (randomHero) {
        awards.push(toAward('random_hero', randomHero, `${randomHero.activities_count} акт.`));
    }

    const savedAwards: MonthlyAward[] = [];
    for (const award of awards) {
        const savedAward = await saveAndRewardAward(chatId, periodKey, award, db);
        if (savedAward) {
            savedAwards.push(savedAward);
        }
    }

    return savedAwards;
}

export async function getMonthlyAwardChatIds(): Promise<string[]> {
    return getActiveChatIds();
}
