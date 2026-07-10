import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { setupBotCommands } from './commands';
import { log } from '../../shared/logger';

dotenv.config();

const TELEGRAM_CONFLICT_ERROR_CODE = 409;
const BOT_LAUNCH_RETRY_DELAY_MS = 5000;
const BOT_LAUNCH_MAX_ATTEMPTS = 12;

const botState: { instance: Telegraf | null } = {
    instance: null,
};

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTelegramConflictError(error: any): boolean {
    return error?.response?.error_code === TELEGRAM_CONFLICT_ERROR_CODE;
}

export function createBot(): Telegraf {
    if (botState.instance) {
        return botState.instance;
    }

    const bot = new Telegraf(process.env.BOT_SECRET!);
    setupBotCommands(bot);
    botState.instance = bot;
    return bot;
}

export function getBot(): Telegraf {
    if (!botState.instance) {
        throw new Error('Bot instance not initialized. Call createBot() first.');
    }
    return botState.instance;
}

export async function launchBot(bot: Telegraf): Promise<void> {
    for (let attempt = 1; attempt <= BOT_LAUNCH_MAX_ATTEMPTS; attempt += 1) {
        try {
            await bot.launch();
            log('INIT', 'Bot launched!');
            return;
        } catch (error) {
            if (!isTelegramConflictError(error) || attempt === BOT_LAUNCH_MAX_ATTEMPTS) {
                throw error;
            }

            log(
                'INIT',
                `Telegram polling conflict on launch. Retrying in ${BOT_LAUNCH_RETRY_DELAY_MS / 1000}s (${attempt}/${BOT_LAUNCH_MAX_ATTEMPTS})`
            );
            await wait(BOT_LAUNCH_RETRY_DELAY_MS);
        }
    }
}

export function stopBot(bot: Telegraf, signal: string): void {
    bot.stop(signal);
    log('INIT', `Bot stopped by ${signal}`);
}
