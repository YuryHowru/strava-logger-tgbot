import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { setupBotCommands } from './commands';
import { log } from '../../shared/logger';

dotenv.config();

let botInstance: Telegraf | null = null;

export function createBot(): Telegraf {
    if (botInstance) {
        return botInstance;
    }

    botInstance = new Telegraf(process.env.BOT_SECRET!);
    setupBotCommands(botInstance);
    return botInstance;
}

export function getBot(): Telegraf {
    if (!botInstance) {
        throw new Error('Bot instance not initialized. Call createBot() first.');
    }
    return botInstance;
}

export async function launchBot(bot: Telegraf): Promise<void> {
    await bot.launch();
    log('INIT', 'Bot launched!');
}

