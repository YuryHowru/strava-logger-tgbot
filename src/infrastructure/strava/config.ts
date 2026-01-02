import strava from 'strava-v3';
import dotenv from 'dotenv';

dotenv.config();

strava.config({
    client_id: process.env.STRAVA_ID!,
    client_secret: process.env.STRAVA_SECRET!,
    access_token: process.env.STRAVA_TOKEN!,
    redirect_uri: process.env.APP_URL!,
});

export default strava;

