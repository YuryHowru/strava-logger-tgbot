import express from 'express';
import { Telegraf } from 'telegraf';
import { pool } from '../infrastructure/database/config';
import { handleStravaAuth } from '../features/auth/service';
import { log, errorLog } from '../shared/logger';
import { createWebhookSubscription } from '../infrastructure/strava/service';
import { webhookHandler } from './handlers/webhook';

export function setupRoutes(app: express.Application, bot: Telegraf) {
    app.use((req, res, next) => {
        if (req.url !== '/healthz') {
            log('HTTP', `${req.method} ${req.url} - IP: ${req.ip}`);
        }
        res.setHeader('Content-Type', 'application/json');
        next();
    });

    app.get('/healthz', (_, res) => res.status(200).send({ status: 'running' }));

    app.get('/ping', (_, res) => {
        res.status(200).send({ status: 'ok' });
    });

    app.get('/auth', async (req, res) => {
        try {
            const { code, state } = req.query as Record<string, string>;
            const chatId = state;
            log('AUTH', `Received auth callback code for chat ${chatId}`);

            const athlete = await handleStravaAuth(code, chatId);

            bot.telegram.sendMessage(
                chatId,
                `🎉 ${athlete.firstname} ${athlete.lastname} профессионально подключил Страву!`
            );

            res.send('Всё сработало, можно закрывать это окно.');
        } catch (error) {
            errorLog('AUTH', 'Error in /auth handler', error);
            res.status(500).send('Server error');
        }
    });

    app.get('/setup-webhooks', async (_, res) => {
        try {
            await createWebhookSubscription(`${process.env.APP_URL}/webhook`);
            res.status(200).send({ status: 'ok' });
        } catch (e) {
            res.status(400).send(e);
        }
    });

    app.get('/users', async (_, res) => {
        try {
            const allUsers = await pool.query(`SELECT * FROM USERS`);
            log('DEBUG', `Found ${allUsers.rowCount} users`);
            res.status(200).send({ status: 'ok' });
        } catch (e) {
            errorLog('DEBUG', 'Error fetching users', e);
            return res.status(400).send();
        }
    });

    app.post('/webhook', express.json(), webhookHandler);
}

