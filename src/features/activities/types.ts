export type User = {
    id: number;
    athleteid: number;
    telegram_id: number | null;
    username: string;
    chatid: string | number;
    accesstoken: string;
    refreshtoken: string;
    expiresat: Date;
    xp: number;
    level: number;
    prestige_level: number;
    is_admin: boolean;
    streak_count: number;
    last_activity: Date | null;
};

export type LevelInfo = {
    level: number;
    required_xp: number;
    total_required_xp: number;
};

export type ActivityEvent = {
    id: number;
    strava_activity_id: number;
    user_id: number;
    chat_id: string;
    activity_type: string;
    activity_name: string;
    distance_m: number | null;
    moving_time_s: number | null;
    calories: number | null;
    earned_xp: number;
    started_at_utc: Date;
    started_at_local: Date;
    local_activity_date: string;
    created_at: Date;
};
