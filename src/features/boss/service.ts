import {
    createBossBattle,
    getActiveChatIds,
    getAverageWeeklyChatXp,
    getBossBattle,
    getBossContributors,
    getBossParticipants,
    grantUserXpOnce,
    markBossBattleDefeated,
    markBossBattleExpired,
    updateBossBattleDamage,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { ActivityEvent } from '../activities/types';
import { getCurrentWeekPeriod } from '../scheduling/dates';
import { prepareBossDefeatedMessage, prepareBossExpiredMessage, prepareBossProgressMessage } from './messages';
import type { BossBattle, BossProcessingResult } from './types';

const BOSS_REWARD_XP = 100;
const MIN_BOSS_HP = 2000;
const BOSS_NAMES = [
    'Диванный Демон',
    'Король Отмазок',
    'Лорд Прокрастинации',
    'Повелитель Лени',
    'Барон Пропуска Тренировок',
    'Граф Пустого Календаря',
    'Генерал Завтра',
    'Доктор Последний Подход',
    'Мастер Слабой Недели',
    'Капитан Без Темпа',
    'Хранитель Нулевого Урона',
    'Архитектор Отдыха',
];

function addDays(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function roundToNearest500(value: number): number {
    return Math.max(MIN_BOSS_HP, Math.round(value / 500) * 500);
}

function pickBossName(chatId: string, periodKey: string): string {
    const seed = `${chatId}:${periodKey}`;
    const index = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0) % BOSS_NAMES.length;
    return BOSS_NAMES[index];
}

async function getBossHp(chatId: string, startDate: string, db?: Queryable): Promise<number> {
    const averageWeeklyXp = await getAverageWeeklyChatXp(chatId, addDays(startDate, -28), startDate, db);
    return roundToNearest500(averageWeeklyXp || MIN_BOSS_HP);
}

function isPastBossPeriod(period: { startDate: string; endDate: string }): boolean {
    return period.endDate <= getCurrentWeekPeriod().startDate;
}

export async function expireBossBattleForPeriod(
    chatId: string,
    period: { key: string },
    db?: Queryable
): Promise<BossBattle | null> {
    return markBossBattleExpired(chatId, period.key, db);
}

export async function ensureBossBattle({
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
}): Promise<BossBattle> {
    const existingBattle = await getBossBattle(chatId, periodKey, db);
    if (existingBattle) {
        return existingBattle;
    }

    const hp = await getBossHp(chatId, startDate, db);
    const createdBattle = await createBossBattle(
        {
            chatId,
            periodKey,
            bossName: pickBossName(chatId, periodKey),
            hp,
            startsOn: startDate,
            endsOn: endDate,
        },
        db
    );

    if (!createdBattle) {
        const raceWinner = await getBossBattle(chatId, periodKey, db);
        if (!raceWinner) {
            throw new Error(`Failed to create boss battle for ${chatId}/${periodKey}`);
        }

        return raceWinner;
    }

    return createdBattle;
}

export async function createWeeklyBossBattles(period = getCurrentWeekPeriod()): Promise<void> {
    const chatIds = await getActiveChatIds();
    await Promise.all(chatIds.map((chatId) => ensureWeeklyBossBattleForChat(chatId, period)));
}

export function ensureWeeklyBossBattleForChat(
    chatId: string,
    period = getCurrentWeekPeriod(),
    db?: Queryable
): Promise<BossBattle> {
    return ensureBossBattle({
        chatId,
        periodKey: period.key,
        startDate: period.startDate,
        endDate: period.endDate,
        db,
    });
}

export function getWeeklyBossBattleForChat(
    chatId: string,
    period = getCurrentWeekPeriod(),
    db?: Queryable
): Promise<BossBattle | null> {
    return getBossBattle(chatId, period.key, db);
}

export async function getCurrentBossStatus(chatId: string): Promise<{ battle: BossBattle | null; contributors: Awaited<ReturnType<typeof getBossContributors>> }> {
    const period = getCurrentWeekPeriod();
    const battle = await ensureWeeklyBossBattleForChat(chatId, period);
    const contributors = await getBossContributors(chatId, period.startDate, period.endDate);

    return { battle, contributors };
}

export async function processBossBattle({
    activityEvent,
    damageXp,
    db,
}: {
    activityEvent: ActivityEvent;
    damageXp: number;
    db: Queryable;
}): Promise<BossProcessingResult> {
    if (damageXp <= 0) {
        return { progressMessage: null, defeatMessage: null, xpRewards: [] };
    }

    const period = getCurrentWeekPeriod(activityEvent.started_at_utc);
    const battle = await ensureWeeklyBossBattleForChat(activityEvent.chat_id, period, db);

    if (battle.status !== 'active') {
        return { progressMessage: null, defeatMessage: null, xpRewards: [] };
    }

    if (isPastBossPeriod(period)) {
        const expiredBattle = await expireBossBattleForPeriod(activityEvent.chat_id, period, db);
        return {
            progressMessage: expiredBattle ? prepareBossExpiredMessage(expiredBattle) : null,
            defeatMessage: null,
            xpRewards: [],
        };
    }

    const updatedBattle = await updateBossBattleDamage(battle.id, damageXp, db);
    const progressMessage = prepareBossProgressMessage(updatedBattle, damageXp);

    if (updatedBattle.current_damage < updatedBattle.hp) {
        return { progressMessage, defeatMessage: null, xpRewards: [] };
    }

    const defeatedBattle = await markBossBattleDefeated(updatedBattle.id, activityEvent.started_at_utc, db);
    if (!defeatedBattle) {
        return { progressMessage, defeatMessage: null, xpRewards: [] };
    }

    const participants = await getBossParticipants(defeatedBattle.chat_id, period.startDate, period.endDate, db);
    let rewardedUsersCount = 0;
    let currentUserRewardXp = 0;

    for (const participant of participants) {
        const grantedXp = await grantUserXpOnce(
            {
                userId: participant.user_id,
                grantType: 'boss_defeat',
                periodKey: defeatedBattle.period_key,
                xp: BOSS_REWARD_XP,
                reason: 'Победа над боссом недели',
            },
            db
        );

        if (grantedXp > 0) {
            rewardedUsersCount += 1;
            currentUserRewardXp = participant.user_id === activityEvent.user_id ? grantedXp : currentUserRewardXp;
        }
    }

    return {
        progressMessage,
        defeatMessage: prepareBossDefeatedMessage(defeatedBattle, rewardedUsersCount, BOSS_REWARD_XP),
        xpRewards: currentUserRewardXp > 0 ? [{ label: 'Победа над боссом', xp: currentUserRewardXp }] : [],
    };
}
