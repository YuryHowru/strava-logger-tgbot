import express from 'express';
import dotenv from 'dotenv';
import { setupRoutes } from './routes/routes';
import { createBot, launchBot } from './infrastructure/bot/config';
import { initializeDatabase } from './infrastructure/database/bootstrap';
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

    await launchBot(bot);
}

bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
});
