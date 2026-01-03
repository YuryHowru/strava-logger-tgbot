import { Telegraf } from 'telegraf';
import { pool } from '../database/config';
import {
    getUserByTelegramId,
    getUserByUsername,
    getTopUsers,
    findLevelInDb,
    updateUserXpAndLevel,
} from '../database/service';
import { prepareAddXpMessage } from '../../features/activities/xp';
import { User } from '../../features/activities/types';
import { log, errorLog } from '../../shared/logger';
import { getStravaAuthUrl } from '../strava/service';
import { rankSystem } from '../../features/activities/constants';

export function setupBotCommands(bot: Telegraf) {
    bot.command('ping', (ctx) => {
        ctx.reply('pong');
    });

    bot.command('credit', (ctx) => {
        ctx.replyWithMarkdownV2('[GitHub Repository](https://github.com/YuryHowru/strava-logger-tgbot)');
    });

    bot.command('auth', (ctx: any) => {
        log('BOT', `Command /auth from ${ctx.from.id} in chat ${ctx.chat.id}`);
        ctx.reply('🤖', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Авторизовать Страву', url: getStravaAuthUrl(ctx.chat.id) }]],
            },
        });
    });

    bot.command('me', async (ctx) => {
        log('BOT', `Command /me from ${ctx.from.id}`);
        try {
            const user = await getUserByTelegramId(ctx.from.id);

            if (!user) {
                log('BOT', `User ${ctx.from.id} not found in DB`);
                return ctx.reply('🚨 Нет такого');
            }

            const levelInfo = await findLevelInDb(user.xp);

            const message = `
    👤 *${user.username}*
    ━━━━━━━━━━━━━━━━━━
    ▫️ *Уровень:* ${levelInfo.level}
    ▫️ *Опыт:* ${user.xp} / ${levelInfo.total_required_xp} XP
    ━━━━━━━━━━━━━━━━━━
    `;

            ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            errorLog('BOT', 'Error processing /me', error);
            ctx.reply('❌ Произошла ошибка при получении информации. Попробуйте позже.');
        }
    });

    bot.command('help', (ctx) => {
        const message = `
  📌 *Список команд*

  🔹 /auth — подключить аккаунт Strava.
  🔹 /me — посмотреть свой уровень и XP.
  🔹 /top — посмотреть топ-10 пользователей по уровню.
  🔹 /credit — ссылка на GitHub репозиторий проекта.
  🔹 /ping — pong.
  `;

        ctx.reply(message, { parse_mode: 'Markdown' });
    });

    bot.command('top', async (ctx) => {
        try {
            const topUsers = await getTopUsers(10);
            log('DB', `Fetched ${topUsers.length} users for leaderboard`);

            const leaderboard = topUsers
                .map((user, index) => `${index + 1}. *${user.username}* — ${rankSystem[user.level]} (${user.xp} XP)`)
                .join('\n');

            const message = `🏆 *Лидерборд* 🏆\n\n${leaderboard}`;

            ctx.reply(message, { parse_mode: 'Markdown' });
        } catch (error) {
            errorLog('DB', 'Error fetching leaderboard', error);
            ctx.reply('❌ Ошибка при получении лидерборда. Попробуйте позже.');
        }
    });

    bot.command('addxp', async (ctx) => {
        log('ADMIN', `Command /addxp by ${ctx.from.id}`, ctx.message.text);
        const senderResult = await pool.query<User>(`SELECT is_admin FROM users WHERE telegram_id = $1`, [ctx.from.id]);
        const sender = senderResult.rows[0];
        if (!sender || !sender.is_admin) {
            log('ADMIN', `Access denied for ${ctx.from.id}`);
            return ctx.reply('❌ Жук.');
        }

        const parts = ctx.message.text.split(' ');

        if (parts.length < 3) {
            return ctx.reply('Использование: /addxp <username> <XP>');
        }

        const xpToAddStr = parts[parts.length - 1];
        const xpToAdd = parseInt(xpToAddStr);

        const username = parts.slice(1, parts.length - 1).join(' ');

        if (!username || isNaN(xpToAdd)) {
            return ctx.reply('Использование: /addxp <username> <XP>');
        }

        try {
            const user = await getUserByUsername(username);

            if (!user) {
                log('ADMIN', `User ${username} not found`);
                return ctx.reply(`🚨 Пользователь ${username} не найден.`);
            }

            const newXp = user.xp + xpToAdd;
            const newLevelInfo = await findLevelInDb(newXp);
            const newLevel = newLevelInfo.level;

            await updateUserXpAndLevel(user.id, newXp, newLevel);
            log('ADMIN', `Added ${xpToAdd} XP to ${username}. New Level: ${newLevel}`);

            const nextLevelRequiredXp = newLevelInfo.total_required_xp;
            const message = prepareAddXpMessage({ user, xpToAdd, newLevel, nextLevelRequiredXp });
            ctx.reply(message);
        } catch (error) {
            errorLog('ADMIN', 'Error in /addxp', error);
        }
    });
}
