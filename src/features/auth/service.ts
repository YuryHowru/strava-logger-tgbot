import { pool } from '../../infrastructure/database/config';
import type { User } from '../activities/types';
import { log } from '../../shared/logger';
import strava from '../../infrastructure/strava/config';

export async function refreshUserToken(user: User): Promise<void> {
    const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.STRAVA_ID,
            client_secret: process.env.STRAVA_SECRET,
            grant_type: 'refresh_token',
            refresh_token: user.refreshtoken,
        }),
    });

    const refreshResult = await response.json();

    await pool.query(
        `UPDATE users
        SET accesstoken = $1, refreshtoken = $2, expiresat = $3
        WHERE athleteid = $4`,
        [refreshResult.access_token, refreshResult.refresh_token, refreshResult.expires_at, user.athleteid]
    );

    user.accesstoken = refreshResult.access_token;
    user.refreshtoken = refreshResult.refresh_token;
    user.expiresat = refreshResult.expires_at;

    log('AUTH', `Refreshed token for user ${user.username} (${user.athleteid})`);
}

export async function handleStravaAuth(code: string, chatId: string): Promise<{ firstname: string; lastname: string }> {
    const tokenResponse = await strava.oauth.getToken(code);
    const { access_token, refresh_token, expires_at, athlete } = tokenResponse;

    log('AUTH', `Got tokens for athlete: ${athlete.id} (${athlete.firstname} ${athlete.lastname})`);

    const queryText = `
      INSERT INTO users (athleteId, accessToken, refreshToken, expiresAt, chatId, username)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (athleteId) DO UPDATE SET
        accessToken = EXCLUDED.accessToken,
        refreshToken = EXCLUDED.refreshToken,
        expiresAt = EXCLUDED.expiresAt,
        chatId = EXCLUDED.chatId,
        username = EXCLUDED.username
    `;

    const values = [
        athlete.id,
        access_token,
        refresh_token,
        expires_at,
        chatId,
        athlete.username ?? `${athlete.firstname} ${athlete.lastname}`,
    ];

    await pool.query(queryText, values);
    log('DB', `User ${athlete.id} saved/updated in DB.`);

    return { firstname: athlete.firstname, lastname: athlete.lastname };
}


