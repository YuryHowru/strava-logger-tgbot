import express from 'express';
import dotenv from 'dotenv';
import { setupRoutes } from './routes/routes';
import { createBot, launchBot } from './infrastructure/bot/config';
import { checkAndSendXmasMessage } from './features/xmas/service';
import { log } from './shared/logger';

dotenv.config();

const app = express();
const bot = createBot();

setupRoutes(app, bot);

app.listen(process.env.PORT, () => {
    log('INIT', `Server running on port ${process.env.PORT} URL: ${process.env.APP_URL}`);

    // hack to keep Render free server awake (sleep after 15min inactivity)
    setInterval(async () => {
        await fetch(`${process.env.APP_URL}/ping`);
        await checkAndSendXmasMessage(bot);
    }, 14 * 60 * 1000);
});

launchBot(bot);
