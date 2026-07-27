import {
    completeUserQuest,
    createUserQuest,
    getActiveChatIds,
    getChatUsers,
    getUserActivityStatsForPeriod,
    getUserQuestsForPeriod,
    getUserRecentActivityStats,
    grantUserXpOnce,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import type { ActivityEvent, User } from '../activities/types';
import { getCurrentWeekPeriod } from '../scheduling/dates';
import { prepareQuestCompletedMessage } from './messages';
import type { QuestProgress, QuestProcessingResult, QuestType, UserQuest } from './types';

const QUEST_REWARD_XP = 100;

type QuestTarget = {
    questType: QuestType;
    targetValue: number;
};

function getQuestTargets(recentStats: { activities_count: number; total_xp: number; active_days: number }): QuestTarget[] {
    const weeklyActivityAverage = recentStats.activities_count / 4;

    if (weeklyActivityAverage < 1.5) {
        return [
            { questType: 'activity_count', targetValue: 1 },
            { questType: 'xp', targetValue: 100 },
            { questType: 'active_days', targetValue: 1 },
        ];
    }

    if (weeklyActivityAverage < 4) {
        return [
            { questType: 'activity_count', targetValue: 3 },
            { questType: 'xp', targetValue: 300 },
            { questType: 'active_days', targetValue: 2 },
        ];
    }

    return [
        { questType: 'activity_count', targetValue: 5 },
        { questType: 'xp', targetValue: 700 },
        { questType: 'active_days', targetValue: 4 },
    ];
}

function addDays(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function getQuestCurrentValue(quest: UserQuest, stats: { activities_count: number; total_xp: number; active_days: number }): number {
    if (quest.quest_type === 'xp') {
        return stats.total_xp;
    }

    if (quest.quest_type === 'active_days') {
        return stats.active_days;
    }

    return stats.activities_count;
}

async function ensureUserWeeklyQuests({
    userId,
    periodKey,
    startDate,
    db,
}: {
    userId: number;
    periodKey: string;
    startDate: string;
    db?: Queryable;
}): Promise<UserQuest[]> {
    const existingQuests = await getUserQuestsForPeriod(userId, periodKey, db);
    if (existingQuests.length) {
        return existingQuests;
    }

    const recentStats = await getUserRecentActivityStats(userId, addDays(startDate, -28), startDate, db);
    const targets = getQuestTargets(recentStats);

    for (const target of targets) {
        await createUserQuest(
            {
                userId,
                periodKey,
                questType: target.questType,
                targetValue: target.targetValue,
                rewardXp: QUEST_REWARD_XP,
            },
            db
        );
    }

    return getUserQuestsForPeriod(userId, periodKey, db);
}

export async function createWeeklyQuestsForActiveChats(period = getCurrentWeekPeriod()): Promise<void> {
    const chatIds = await getActiveChatIds();

    await Promise.all(chatIds.map((chatId) => createWeeklyQuestsForChat(chatId, period)));
}

export async function createWeeklyQuestsForChat(
    chatId: string,
    period = getCurrentWeekPeriod()
): Promise<void> {
    const users = await getChatUsers(chatId);
    await Promise.all(
        users.map((user) =>
            ensureUserWeeklyQuests({
                userId: user.id,
                periodKey: period.key,
                startDate: period.startDate,
            })
        )
    );
}

export async function getUserWeeklyQuestProgress(user: User, now = new Date()): Promise<QuestProgress[]> {
    const period = getCurrentWeekPeriod(now);
    const quests = await ensureUserWeeklyQuests({
        userId: user.id,
        periodKey: period.key,
        startDate: period.startDate,
    });
    const stats = await getUserActivityStatsForPeriod(user.id, period.startDate, period.endDate);

    return quests.map((quest) => ({
        quest,
        currentValue: Math.min(getQuestCurrentValue(quest, stats), quest.target_value),
    }));
}

export async function processUserQuests({
    user,
    activityEvent,
    db,
}: {
    user: User;
    activityEvent: ActivityEvent;
    db: Queryable;
}): Promise<QuestProcessingResult> {
    const period = getCurrentWeekPeriod(activityEvent.started_at_utc);
    const quests = await ensureUserWeeklyQuests({
        userId: user.id,
        periodKey: period.key,
        startDate: period.startDate,
        db,
    });
    const stats = await getUserActivityStatsForPeriod(user.id, period.startDate, period.endDate, db);
    const completedMessages: string[] = [];

    for (const quest of quests) {
        if (quest.status === 'completed' || getQuestCurrentValue(quest, stats) < quest.target_value) {
            continue;
        }

        const completedQuest = await completeUserQuest(quest.id, activityEvent.started_at_utc, db);
        if (!completedQuest) {
            continue;
        }

        await grantUserXpOnce(
            {
                userId: user.id,
                grantType: `quest_${completedQuest.quest_type}`,
                periodKey: completedQuest.period_key,
                xp: completedQuest.reward_xp,
                reason: 'Личный недельный квест',
            },
            db
        );
        completedMessages.push(prepareQuestCompletedMessage(completedQuest));
    }

    return { completedMessages };
}
