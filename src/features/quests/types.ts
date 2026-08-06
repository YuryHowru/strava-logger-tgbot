import type { XpReward } from '../activities/xp';

export type QuestType = 'activity_count' | 'xp' | 'active_days';

export type UserQuest = {
    id: number;
    user_id: number;
    period_key: string;
    quest_type: QuestType;
    target_value: number;
    reward_xp: number;
    status: 'active' | 'completed';
    created_at: Date;
    completed_at: Date | null;
};

export type QuestProgress = {
    quest: UserQuest;
    currentValue: number;
};

export type QuestProcessingResult = {
    completedMessages: string[];
    xpRewards: XpReward[];
};
