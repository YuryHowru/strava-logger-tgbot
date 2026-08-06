export type BossDate = string | Date;

export type BossBattle = {
    id: number;
    chat_id: string;
    period_key: string;
    boss_name: string;
    hp: number;
    current_damage: number;
    status: 'active' | 'defeated' | 'expired';
    starts_on: BossDate;
    ends_on: BossDate;
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
