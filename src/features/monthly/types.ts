export type MonthlyAwardType = 'xp_machine' | 'most_consistent' | 'comeback' | 'small_steps' | 'random_hero';

export type MonthlyAwardCandidate = {
    user_id: number;
    username: string;
    activities_count: number;
    total_xp: number;
    active_days: number;
};

export type MonthlyComebackCandidate = {
    user_id: number;
    username: string;
    inactivity_days: number;
};

export type MonthlyAward = {
    awardType: MonthlyAwardType;
    title: string;
    winnerUserId: number;
    username: string;
    value: string;
    rewardXp: number;
};
