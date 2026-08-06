import { grantUserXpOnce, getWeeklySummaryRows } from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { WeeklySummary } from './types';

const WEEKLY_RANDOM_REWARD_XP = 100;

function pickRandomWinner<T>(items: T[]): T | null {
    if (!items.length) {
        return null;
    }

    return items[Math.floor(Math.random() * items.length)];
}

export async function buildWeeklySummary({
    chatId,
    periodKey,
    startDate,
    endDate,
    bossBattle = null,
    db,
}: {
    chatId: string;
    periodKey: string;
    startDate: string;
    endDate: string;
    bossBattle?: WeeklySummary['bossBattle'];
    db?: Queryable;
}): Promise<WeeklySummary> {
    const standings = await getWeeklySummaryRows({ chatId, startDate, endDate }, db);
    const randomWinner = pickRandomWinner(standings);
    let randomWinnerGrantedXp = 0;

    if (randomWinner) {
        const grantedXp = await grantUserXpOnce(
            {
                userId: randomWinner.user_id,
                grantType: 'weekly_random',
                periodKey,
                xp: WEEKLY_RANDOM_REWARD_XP,
                reason: 'Рандом недели',
            },
            db
        );

        randomWinnerGrantedXp = grantedXp;
    }

    return {
        chatId,
        periodKey,
        startDate,
        endDate,
        activeUsersCount: standings.length,
        totalActivities: standings.reduce((total, user) => total + user.activities_count, 0),
        totalXp: standings.reduce((total, user) => total + user.total_xp, 0),
        totalDistanceM: standings.reduce((total, user) => total + user.total_distance_m, 0),
        standings,
        randomWinner,
        randomWinnerGrantedXp,
        bossBattle,
    };
}
