import type { Telegraf } from 'telegraf';
import { getActiveChatIds, reserveScheduledReport } from '../database/service';
import { getCurrentWeekPeriod, getPreviousMonthPeriod, getPreviousWeekPeriod, isMonthlyReportDue, isWeeklyReportDue } from '../../features/scheduling/dates';
import { buildWeeklySummary } from '../../features/weekly/service';
import { prepareWeeklySummaryMessage } from '../../features/weekly/messages';
import { createWeeklyQuestsForActiveChats } from '../../features/quests/service';
import { createWeeklyBossBattles, ensureWeeklyBossBattleForChat, expireBossBattleForPeriod, getWeeklyBossBattleForChat } from '../../features/boss/service';
import { prepareBossSpawnMessage } from '../../features/boss/messages';
import { buildMonthlyAwards } from '../../features/monthly/service';
import { prepareMonthlyAwardsMessage } from '../../features/monthly/messages';
import { errorLog, log } from '../../shared/logger';

const SCHEDULER_INTERVAL_MS = 14 * 60 * 1000;

async function sendWeeklyReports(bot: Telegraf, now: Date): Promise<void> {
    const period = getPreviousWeekPeriod(now);
    const currentWeek = getCurrentWeekPeriod(now);
    const chatIds = await getActiveChatIds();

    for (const chatId of chatIds) {
        try {
            const reserved = await reserveScheduledReport({
                chatId,
                reportType: 'weekly',
                periodKey: period.key,
            });

            if (!reserved) {
                continue;
            }

            const previousBoss = await getWeeklyBossBattleForChat(chatId, period);
            await expireBossBattleForPeriod(chatId, period);
            const newBoss = await ensureWeeklyBossBattleForChat(chatId, currentWeek);
            const summary = await buildWeeklySummary({
                chatId,
                periodKey: period.key,
                startDate: period.startDate,
                endDate: period.endDate,
                bossBattle: previousBoss,
            });

            await bot.telegram.sendMessage(chatId, prepareWeeklySummaryMessage(summary), { parse_mode: 'Markdown' });
            await bot.telegram.sendMessage(chatId, prepareBossSpawnMessage(newBoss), { parse_mode: 'Markdown' });
            log('SCHEDULER', `Weekly report sent to chat ${chatId} for ${period.key}`);
        } catch (error) {
            errorLog('SCHEDULER', `Failed to send weekly report to chat ${chatId}`, error);
        }
    }
}

async function sendMonthlyAwards(bot: Telegraf, now: Date): Promise<void> {
    const period = getPreviousMonthPeriod(now);
    const chatIds = await getActiveChatIds();

    for (const chatId of chatIds) {
        try {
            const reserved = await reserveScheduledReport({
                chatId,
                reportType: 'monthly',
                periodKey: period.key,
            });

            if (!reserved) {
                continue;
            }

            const awards = await buildMonthlyAwards({
                chatId,
                periodKey: period.key,
                startDate: period.startDate,
                endDate: period.endDate,
            });

            await bot.telegram.sendMessage(chatId, prepareMonthlyAwardsMessage(period.key, awards), { parse_mode: 'Markdown' });
            log('SCHEDULER', `Monthly awards sent to chat ${chatId} for ${period.key}`);
        } catch (error) {
            errorLog('SCHEDULER', `Failed to send monthly awards to chat ${chatId}`, error);
        }
    }
}

export async function runScheduledJobs(bot: Telegraf, now = new Date()): Promise<void> {
    if (isWeeklyReportDue(now)) {
        const currentWeek = getCurrentWeekPeriod(now);
        await Promise.all([createWeeklyQuestsForActiveChats(currentWeek), createWeeklyBossBattles(currentWeek)]);
        await sendWeeklyReports(bot, now);
    }

    if (isMonthlyReportDue(now)) {
        await sendMonthlyAwards(bot, now);
    }
}

export function startScheduledJobs(bot: Telegraf): NodeJS.Timeout {
    log('SCHEDULER', 'Scheduled jobs started.');

    return setInterval(async () => {
        try {
            await runScheduledJobs(bot);
        } catch (error) {
            errorLog('SCHEDULER', 'Scheduled jobs tick failed', error);
        }
    }, SCHEDULER_INTERVAL_MS);
}
