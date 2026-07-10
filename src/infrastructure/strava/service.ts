import strava, { DetailedActivityResponse } from 'strava-v3';
import { errorLog, log } from '../../shared/logger';

export function getStravaAuthUrl(stateToken: string): string {
    return `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_ID}&response_type=code&redirect_uri=${process.env.APP_URL}/auth/&approval_prompt=force&scope=read,activity:read&state=${stateToken}`;
}

export function getFullActivityInfo({ activityId, userAccessToken }: { activityId: number; userAccessToken: string }): Promise<DetailedActivityResponse & { type: string }> {
    return new Promise<DetailedActivityResponse & { type: string }>((resolve, reject) =>
        strava.activities.get({ id: activityId, access_token: userAccessToken }, (err, activity) => {
            if (err) {
                errorLog('STRAVA', `Error fetching activity ${activityId}`, err);
                return reject({ message: 'Error fetching activity details from Strava', err });
            }
            log('STRAVA', `Activity ${activityId} details fetched successfully.`);
            resolve(activity);
        })
    );
}

export async function createWebhookSubscription(callbackUrl: string): Promise<any> {
    return await strava.pushSubscriptions.create({
        client_id: process.env.STRAVA_ID!,
        client_secret: process.env.STRAVA_SECRET!,
        callback_url: callbackUrl,
        verify_token: 'WEBHOOK_VERIFY',
    });
}
