import express from 'express';
import { Telegraf } from 'telegraf';
import { pool } from '../infrastructure/database/config';
import { consumeAuthSession } from '../infrastructure/database/service';
import { createWebhookSubscription } from '../infrastructure/strava/service';
import { handleStravaAuth } from '../features/auth/service';
import { errorLog, log } from '../shared/logger';
import { webhookHandler } from './handlers/webhook';

type RouteHandler = (req: express.Request, res: express.Response) => Promise<void>;

function withRouteErrorHandling(tag: string, handler: RouteHandler): RouteHandler {
    return async (req, res) => {
        try {
            await handler(req, res);
        } catch (error) {
            errorLog(tag, `Error in ${req.path} handler`, error);
            res.status(500).send('Server error');
        }
    };
}

function setDefaultResponseHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.url !== '/healthz') {
        log('HTTP', `${req.method} ${req.url} - IP: ${req.ip}`);
    }

    res.setHeader('Content-Type', 'application/json');
    next();
}

async function handleAuthCallback(bot: Telegraf, req: express.Request, res: express.Response): Promise<void> {
    const { code, state } = req.query as Record<string, string>;
    if (!code || !state) {
        res.status(400).send('Missing code or state');
        return;
    }

    const authSession = await consumeAuthSession(state);
    if (!authSession) {
        res.status(400).send('Auth link is invalid, expired, or already used. Please request /auth again.');
        return;
    }

    const { chat_id: chatId, telegram_id: telegramId } = authSession;
    log('AUTH', `Received auth callback code for chat ${chatId}`);

    const athlete = await handleStravaAuth(code, chatId, telegramId);
    await bot.telegram.sendMessage(chatId, `🎉 ${athlete.firstname} ${athlete.lastname} профессионально подключил Страву!`);
    res.send('Всё сработало, можно закрывать это окно.');
}

async function handleSetupWebhooks(_: express.Request, res: express.Response): Promise<void> {
    await createWebhookSubscription(`${process.env.APP_URL}/webhook`);
    res.status(200).send({ status: 'ok' });
}

async function handleUsersDebug(_: express.Request, res: express.Response): Promise<void> {
    const allUsers = await pool.query('SELECT * FROM users');
    log('DEBUG', `Found ${allUsers.rowCount} users`);
    res.status(200).send({ status: 'ok' });
}

export function setupRoutes(app: express.Application, bot: Telegraf) {
    app.use(setDefaultResponseHeaders);

    app.get('/healthz', (_, res) => res.status(200).send({ status: 'running' }));
    app.get('/ping', (_, res) => res.status(200).send({ status: 'ok' }));
    app.get('/auth', withRouteErrorHandling('AUTH', (req, res) => handleAuthCallback(bot, req, res)));
    app.get('/setup-webhooks', withRouteErrorHandling('WEBHOOK_SETUP', handleSetupWebhooks));
    app.get('/users', withRouteErrorHandling('DEBUG', handleUsersDebug));
    app.post('/webhook', express.json(), webhookHandler);
}
