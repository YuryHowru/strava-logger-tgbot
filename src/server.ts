import express from 'express';
import dotenv from 'dotenv';
import { setupRoutes } from './routes/routes';
import { createBot, launchBot, stopBot } from './infrastructure/bot/config';
import { initializeDatabase } from './infrastructure/database/bootstrap';
import { startScheduledJobs } from './infrastructure/scheduler/service';
import { log } from './shared/logger';

dotenv.config();

async function bootstrap() {
    await initializeDatabase();

    const app = express();
    const bot = createBot();

    setupRoutes(app, bot);

    app.listen(process.env.PORT, () => {
        log('INIT', `Server running on port ${process.env.PORT} URL: ${process.env.APP_URL}`);

        setInterval(async () => {
            await fetch(`${process.env.APP_URL}/ping`);
        }, 14 * 60 * 1000);
    });

    startScheduledJobs(bot);
    await launchBot(bot);

    process.once('SIGINT', () => stopBot(bot, 'SIGINT'));
    process.once('SIGTERM', () => stopBot(bot, 'SIGTERM'));
}

bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
});
