export type BadgeKey =
    | 'first_activity'
    | 'streak_3'
    | 'streak_7'
    | 'level_5'
    | 'level_10'
    | 'run_10k'
    | 'ride_50k'
    | 'double_day'
    | 'sniper_distance'
    | 'iron_hour'
    | 'calorie_furnace'
    | 'double_pump'
    | 'sunrise_hunter'
    | 'night_shift'
    | 'challenge_champion'
    | 'triple_crown';

export type BadgeDefinition = {
    key: BadgeKey;
    title: string;
    description: string;
};

export type UserAchievement = {
    badge_key: BadgeKey;
    unlocked_at: Date;
};
