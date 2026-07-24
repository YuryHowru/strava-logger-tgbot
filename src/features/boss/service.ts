import {
    createBossBattle,
    getActiveChatIds,
    getAverageWeeklyChatXp,
    getBossBattle,
    getBossContributors,
    getBossParticipants,
    grantUserXpOnce,
    markBossBattleDefeated,
    updateBossBattleDamage,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { ActivityEvent } from '../activities/types';
import { getCurrentWeekPeriod } from '../scheduling/dates';
import { prepareBossDefeatedMessage, prepareBossProgressMessage } from './messages';
import type { BossBattle, BossProcessingResult } from './types';

const BOSS_REWARD_XP = 100;
const MIN_BOSS_HP = 2000;
const BOSS_NAMES = ['Диванный Демон', 'Король Отмазок', 'Лорд Прокрастинации', 'Повелитель Лени'];

function addDays(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function roundToNearest500(value: number): number {
    return Math.max(MIN_BOSS_HP, Math.round(value / 500) * 500);
}

function pickBossName(periodKey: string): string {
    const index = [...periodKey].reduce((total, char) => total + char.charCodeAt(0), 0) % BOSS_NAMES.length;
    return BOSS_NAMES[index];
}

async function getBossHp(chatId: string, startDate: string, db?: Queryable): Promise<number> {
    const averageWeeklyXp = await getAverageWeeklyChatXp(chatId, addDays(startDate, -28), startDate, db);
    return roundToNearest500(averageWeeklyXp || MIN_BOSS_HP);
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
            bossName: pickBossName(periodKey),
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
    await Promise.all(
        chatIds.map((chatId) =>
            ensureBossBattle({
                chatId,
                periodKey: period.key,
                startDate: period.startDate,
                endDate: period.endDate,
            })
        )
    );
}

export async function getCurrentBossStatus(chatId: string): Promise<{ battle: BossBattle | null; contributors: Awaited<ReturnType<typeof getBossContributors>> }> {
    const period = getCurrentWeekPeriod();
    const battle = await ensureBossBattle({
        chatId,
        periodKey: period.key,
        startDate: period.startDate,
        endDate: period.endDate,
    });
    const contributors = await getBossContributors(chatId, period.startDate, period.endDate);

    return { battle, contributors };
}

export async function processBossBattle({
    activityEvent,
    db,
}: {
    activityEvent: ActivityEvent;
    db: Queryable;
}): Promise<BossProcessingResult> {
    if (activityEvent.earned_xp <= 0) {
        return { progressMessage: null, defeatMessage: null };
    }

    const period = getCurrentWeekPeriod(activityEvent.started_at_utc);
    const battle = await ensureBossBattle({
        chatId: activityEvent.chat_id,
        periodKey: period.key,
        startDate: period.startDate,
        endDate: period.endDate,
        db,
    });

    if (battle.status !== 'active') {
        return { progressMessage: null, defeatMessage: null };
    }

    const updatedBattle = await updateBossBattleDamage(battle.id, activityEvent.earned_xp, db);
    const progressMessage = prepareBossProgressMessage(updatedBattle, activityEvent.earned_xp);

    if (updatedBattle.current_damage < updatedBattle.hp) {
        return { progressMessage, defeatMessage: null };
    }

    const defeatedBattle = await markBossBattleDefeated(updatedBattle.id, activityEvent.started_at_utc, db);
    if (!defeatedBattle) {
        return { progressMessage, defeatMessage: null };
    }

    const participants = await getBossParticipants(defeatedBattle.chat_id, period.startDate, period.endDate, db);
    let rewardedUsersCount = 0;

    for (const participant of participants) {
        const granted = await grantUserXpOnce(
            {
                userId: participant.user_id,
                grantType: 'boss_defeat',
                periodKey: defeatedBattle.period_key,
                xp: BOSS_REWARD_XP,
                reason: 'Победа над боссом недели',
            },
            db
        );

        if (granted) {
            rewardedUsersCount += 1;
        }
    }

    return {
        progressMessage,
        defeatMessage: prepareBossDefeatedMessage(defeatedBattle, rewardedUsersCount, BOSS_REWARD_XP),
    };
}
