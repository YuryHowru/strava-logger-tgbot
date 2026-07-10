export type ChallengeMetric = 'xp' | 'distance' | 'activity_count';

export type ChatChallenge = {
    id: number;
    chat_id: string;
    title: string;
    metric: ChallengeMetric;
    duration_days: number;
    starts_at: Date;
    ends_at: Date;
    status: 'active' | 'finished' | 'stopped';
    created_by_telegram_id: number;
    winner_user_id: number | null;
    winner_reward_xp: number;
    finished_at: Date | null;
};

export type ChallengeStandingRow = {
    user_id: number;
    username: string;
    metric_value: number;
    achieved_at: Date | null;
};

export type ChallengeParticipant = {
    challenge_id: number;
    user_id: number;
    joined_at: Date;
};
