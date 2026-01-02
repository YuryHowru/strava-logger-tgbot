export type User = {
    id: number;
    athleteid: number;
    username: string;
    chatid: string | number;
    accesstoken: string;
    refreshtoken: string;
    expiresat: Date;
    xp: number;
    level: number;
    is_admin: boolean;
    streak_count: number;
    last_activity: Date | null;
};

export type LevelInfo = {
    level: number;
    required_xp: number;
    total_required_xp: number;
};


