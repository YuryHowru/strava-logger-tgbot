export type BossBattle = {
    id: number;
    chat_id: string;
    period_key: string;
    boss_name: string;
    hp: number;
    current_damage: number;
    status: 'active' | 'defeated' | 'expired';
    starts_on: string;
    ends_on: string;
    created_at: Date;
    defeated_at: Date | null;
};

export type BossContributor = {
    user_id: number;
    username: string;
    damage: number;
};

export type BossProcessingResult = {
    progressMessage: string | null;
    defeatMessage: string | null;
};
