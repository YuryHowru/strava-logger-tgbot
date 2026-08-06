import type { QuestProgress, QuestType, UserQuest } from './types';

const questLabels: Record<QuestType, string> = {
    activity_count: 'Закрой тренировки',
    xp: 'Собери XP',
    active_days: 'Тренировочные дни',
};

function formatQuestTarget(quest: UserQuest): string {
    if (quest.quest_type === 'xp') {
        return `${quest.target_value} XP`;
    }

    if (quest.quest_type === 'active_days') {
        return `${quest.target_value} дн.`;
    }

    return `${quest.target_value} шт.`;
}

export function formatQuestRewardLabel(quest: UserQuest): string {
    return `Квест: ${questLabels[quest.quest_type]} — ${formatQuestTarget(quest)}`;
}

function formatProgressValue(quest: UserQuest, currentValue: number): string {
    if (quest.quest_type === 'xp') {
        return `${currentValue}/${quest.target_value} XP`;
    }

    return `${currentValue}/${quest.target_value}`;
}

export function prepareQuestCompletedMessage(quest: UserQuest): string {
    return `🎯 Закрыт квест: ${questLabels[quest.quest_type]} — ${formatQuestTarget(quest)}`;
}

export function prepareQuestsMessage(username: string, progressRows: QuestProgress[]): string {
    if (!progressRows.length) {
        return `🎯 *${username.replaceAll('_', ' ')}*, квесты недели ещё не появились. Загляни позже.`;
    }

    const lines = progressRows.map(({ quest, currentValue }, index) => {
        const mark = quest.status === 'completed' ? '✅' : '⬜️';
        return `${index + 1}. ${mark} *${questLabels[quest.quest_type]}* — ${formatProgressValue(quest, currentValue)}`;
    });

    return [`🎯 *План недели: ${username.replaceAll('_', ' ')}*`, '', ...lines].join('\n');
}
