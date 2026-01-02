import { Telegraf } from 'telegraf';
import { XMAS_CHAT_ID, TIMEZONE_OFFSET, TRIGGER_HOURS, XMAS_MESSAGES } from './constants';
import { errorLog } from '../../shared/logger';

// Состояние (чтобы не отправлять дважды в один час)
let lastTriggeredSlot = '';
let currentMessageIndex = 7;

export async function checkAndSendXmasMessage(botInstance: Telegraf) {
    try {
        const now = new Date();
        const localHour = (now.getUTCHours() + TIMEZONE_OFFSET) % 24;
        const currentDate = now.toISOString().split('T')[0];

        const currentSlot = `${currentDate}-${localHour}`;

        if (TRIGGER_HOURS.includes(localHour) && lastTriggeredSlot !== currentSlot) {
            await botInstance.telegram.sendMessage(XMAS_CHAT_ID, XMAS_MESSAGES[currentMessageIndex]);

            lastTriggeredSlot = currentSlot;
            currentMessageIndex = (currentMessageIndex + 1) % XMAS_MESSAGES.length;
        }
    } catch (e) {
        errorLog('XMAS', 'Error in Xmas logic', e);
    }
}


