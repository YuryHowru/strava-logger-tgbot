import { pool } from './config';
import { User, LevelInfo } from '../../features/activities/types';
import { log } from '../../shared/logger';

export async function findLevelInDb(xp: number): Promise<LevelInfo & { total_required_xp: number }> {
    const levelsQuery = await pool.query<LevelInfo>(`
    SELECT * FROM levels ORDER BY level ASC
  `);

    const levels = levelsQuery.rows;
    if (!levels.length) throw new Error(`[DB] Levels table is empty!`);

    const foundLevel = levels.find(({ total_required_xp }) => total_required_xp > xp)!;
    log('DB', `Found level info`, foundLevel);
    return foundLevel;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
    const result = await pool.query<User>('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return result.rows[0] || null;
}

export async function getUserByAthleteId(athleteId: number): Promise<User | null> {
    const result = await pool.query<User>('SELECT * FROM users WHERE athleteId = $1', [athleteId]);
    return result.rows[0] || null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const result = await pool.query<User>('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
}

export async function getTopUsers(limit: number = 10): Promise<User[]> {
    const topUsersQuery = await pool.query<User>(`
      SELECT username, level, xp
      FROM users
      ORDER BY level DESC, xp DESC
      LIMIT $1;
    `, [limit]);
    return topUsersQuery.rows;
}

export async function updateUserStats(userId: number, xp: number, level: number, lastActivity: number, streakCount: number): Promise<void> {
    await pool.query(
        `
          UPDATE users
          SET xp = $1, level = $2, last_activity = to_timestamp($3), streak_count = $4
          WHERE id = $5`,
        [xp, level, lastActivity, streakCount, userId]
    );
}

export async function updateUserXpAndLevel(userId: number, xp: number, level: number): Promise<void> {
    await pool.query(`UPDATE users SET xp = $1, level = $2 WHERE id = $3`, [xp, level, userId]);
}

