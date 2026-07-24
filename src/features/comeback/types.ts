export type ComebackCampaign = {
    id: number;
    user_id: number;
    trigger_activity_event_id: number;
    completed_activity_event_id: number | null;
    inactivity_days: number;
    reward_xp: number;
    status: 'active' | 'completed' | 'expired';
    started_at: Date;
    expires_at: Date;
    completed_at: Date | null;
};

export type ComebackResult = {
    message: string | null;
    unlockedBadgeKeys: Array<'comeback_7' | 'comeback_14' | 'comeback_30'>;
};
