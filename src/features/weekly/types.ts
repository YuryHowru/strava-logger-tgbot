import type { BossBattle } from '../boss/types';

export type WeeklySummaryRow = {
    user_id: number;
    username: string;
    activities_count: number;
    total_xp: number;
    total_distance_m: number;
    active_days: number;
};

export type WeeklySummary = {
    chatId: string;
    periodKey: string;
    startDate: string;
    endDate: string;
    activeUsersCount: number;
    totalActivities: number;
    totalXp: number;
    totalDistanceM: number;
    standings: WeeklySummaryRow[];
    randomWinner: WeeklySummaryRow | null;
    randomWinnerGrantedXp: number;
    bossBattle: BossBattle | null;
};
