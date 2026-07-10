import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { setupBotCommands } from './commands';
import { log } from '../../shared/logger';

dotenv.config();

const botState: { instance: Telegraf | null } = {
    instance: null,
};

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
    await bot.launch();
    log('INIT', 'Bot launched!');
}
