import { randomUUID } from 'crypto';
import { Telegraf } from 'telegraf';
import { pool } from '../database/config';
import {
    createAuthSession,
    createChallenge,
    findLevelInDb,
    getActiveChallengeByChatId,
    getChallengeParticipants,
    getChallengeStandings,
    getChallengeWinnerBadges,
    getTopUsers,
    getUserAchievements,
    getUserByTelegramId,
    getUserByUsername,
    isTelegramUserAdmin,
    joinChallenge,
    updateUserXpAndLevel,
} from '../database/service';
import { rankSystem } from '../../features/activities/constants';
import { prepareAddXpMessage } from '../../features/activities/xp';
import { prepareBadgesListMessage } from '../../features/achievements/service';
import { prepareChallengeStartedMessage, prepareChallengeStatusMessage } from '../../features/challenges/messages';
import { finalizeChallenge, isChallengeExpired, parseChallengeMetric } from '../../features/challenges/service';
import { getStravaAuthUrl } from '../strava/service';
import { errorLog, log } from '../../shared/logger';

type BotContext = any;

type CommandHandler = (ctx: BotContext) => Promise<void> | void;
type UserMessage = string | ((ctx: BotContext, error?: unknown) => string);

function getMessageText(ctx: BotContext): string {
    return ctx.message?.text ?? '';
}

function getChatId(ctx: BotContext): string {
    return String(ctx.chat.id);
}

function getUserMessage(ctx: BotContext, userMessage: UserMessage, error?: unknown): string {
    return typeof userMessage === 'function' ? userMessage(ctx, error) : userMessage;
}

function createCommandHandler(tag: string, userMessage: UserMessage, handler: CommandHandler): CommandHandler {
    return async (ctx) => {
        try {
            await handler(ctx);
        } catch (error) {
            errorLog('BOT', tag, error);
            await ctx.reply(getUserMessage(ctx, userMessage, error));
        }
    };
}

async function withTransaction<T>(handler: (client: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await handler(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function finalizeExpiredChallenge(chatId: string): Promise<string | null> {
    return withTransaction(async (client) => {
        const activeChallenge = await getActiveChallengeByChatId(chatId, client);
        if (!activeChallenge || !isChallengeExpired(activeChallenge)) {
            return null;
        }

        const result = await finalizeChallenge({
            challenge: activeChallenge,
            status: 'finished',
            db: client,
        });

        return result.announcement;
    });
}

async function sendChallengeAnnouncementIfNeeded(ctx: BotContext): Promise<void> {
    const challengeAnnouncement = await finalizeExpiredChallenge(getChatId(ctx));
    if (challengeAnnouncement) {
        await ctx.reply(challengeAnnouncement, { parse_mode: 'Markdown' });
    }
}

async function assertAdmin(ctx: BotContext): Promise<boolean> {
    const isAdmin = await isTelegramUserAdmin(ctx.from.id);
    if (!isAdmin) {
        await ctx.reply('❌ Только для админа.');
    }

    return isAdmin;
}

async function getLinkedUserOrReply(ctx: BotContext) {
    const user = await getUserByTelegramId(ctx.from.id);

    if (!user) {
        await ctx.reply('🚨 Сначала подключи Strava через /auth');
        return null;
    }

    return user;
}

function buildPrivateChatHelpMessage(ctx: BotContext): string {
    const botUsername = ctx.botInfo?.username;
    return botUsername
        ? `❌ Не смог написать тебе в личку. Сначала открой https://t.me/${botUsername} и нажми Start, потом повтори /auth.`
        : '❌ Не смог написать тебе в личку. Сначала открой личный чат с ботом и нажми Start, потом повтори /auth.';
}

function buildAuthErrorMessage(ctx: BotContext, error?: any): string {
    const errorCode = error?.response?.error_code;
    return errorCode === 403 ? buildPrivateChatHelpMessage(ctx) : '❌ Не получилось подготовить ссылку авторизации. Попробуй ещё раз.';
}

async function sendPrivateAuthLink(bot: Telegraf, ctx: BotContext): Promise<void> {
    const authToken = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await createAuthSession({
        token: authToken,
        chatId: getChatId(ctx),
        telegramId: ctx.from.id,
        expiresAt,
    });

    const authUrl = getStravaAuthUrl(authToken);
    const privateMessage = [
        '🔐 *Личная ссылка для подключения Strava*',
        '',
        'Она действует *15 минут* и привязана к твоему Telegram-аккаунту.',
        'Не пересылай её другим.',
        '',
        `[Подключить Strava](${authUrl})`,
    ].join('\n');

    await bot.telegram.sendMessage(ctx.from.id, privateMessage, { parse_mode: 'Markdown' });
}

async function notifyAuthLinkDelivery(ctx: BotContext): Promise<void> {
    if (ctx.chat.id === ctx.from.id) {
        await ctx.reply('🔐 Ссылка уже выше. Она одноразовая и привязана к тебе.');
        return;
    }

    await ctx.reply('🔐 Отправил ссылку в личку. Она одноразовая и привязана только к тебе.', {
        reply_parameters: { message_id: ctx.message.message_id },
    });
}

async function handleAuthCommand(bot: Telegraf, ctx: BotContext): Promise<void> {
    log('BOT', `Command /auth from ${ctx.from.id} in chat ${ctx.chat.id}`);
    await sendPrivateAuthLink(bot, ctx);
    await notifyAuthLinkDelivery(ctx);
}

async function handleMeCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /me from ${ctx.from.id}`);
    const user = await getLinkedUserOrReply(ctx);

    if (!user) {
        log('BOT', `User ${ctx.from.id} not found in DB`);
        return;
    }

    const [levelInfo, achievements, challengeWinnerBadges] = await Promise.all([
        findLevelInDb(user.xp),
        getUserAchievements(user.id),
        getChallengeWinnerBadges(user.id),
    ]);
    const rankTitle = rankSystem[levelInfo.level] ?? 'Без ранга';
    const lastActivity = user.last_activity ? user.last_activity.toLocaleDateString('ru-RU') : 'ещё не было';
    const medalsCount = achievements.length + challengeWinnerBadges.length;
    const message = [
        `🧍 *${user.username.replaceAll('_', ' ')}*`,
        `🏷 *${rankTitle}* · уровень *${levelInfo.level}*`,
        '',
        `⚡️ *XP:* ${user.xp} / ${levelInfo.total_required_xp}`,
        `🔥 *Серия:* ${user.streak_count} дн.`,
        `🏅 *Медали:* ${medalsCount}`,
        `🕒 *Последняя тренировка:* ${lastActivity}`,
    ].join('\n');

    await ctx.reply(message, { parse_mode: 'Markdown' });
}

async function handleBadgesCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /badges from ${ctx.from.id}`);
    const user = await getLinkedUserOrReply(ctx);

    if (!user) {
        return;
    }

    const [achievements, challengeWinnerBadges] = await Promise.all([
        getUserAchievements(user.id),
        getChallengeWinnerBadges(user.id),
    ]);
    const message = prepareBadgesListMessage(user.username, achievements, challengeWinnerBadges);
    await ctx.reply(message, { parse_mode: 'Markdown' });
}

function getHelpMessage(): string {
    return [
        '📌 *Список команд*',
        '',
        '🔹 /auth — подключить аккаунт Strava.',
        '🔹 /me — посмотреть свой уровень и XP.',
        '🔹 /top — посмотреть топ-10 пользователей по уровню.',
        '🔹 /badges — посмотреть свои медали.',
        '🔹 /challenge — посмотреть активный челлендж.',
        '🔹 /challenge_join — вступить в активный челлендж.',
        '🔹 /challenge_start <xp|distance|activities> <days> <title> — старт челленджа.',
        '🔹 /challenge_stop — остановить активный челлендж.',
        '🔹 /credit — ссылка на GitHub репозиторий проекта.',
        '🔹 /ping — pong.',
    ].join('\n');
}

async function handleHelpCommand(ctx: BotContext): Promise<void> {
    await ctx.reply(getHelpMessage(), { parse_mode: 'Markdown' });
}

async function handleTopCommand(ctx: BotContext): Promise<void> {
    const topUsers = await getTopUsers(10);
    log('DB', `Fetched ${topUsers.length} users for leaderboard`);

    const leaderboard = topUsers
        .map((user, index) => `${index + 1}. *${user.username}* — ${rankSystem[user.level]} (${user.xp} XP)`)
        .join('\n');

    await ctx.reply(`🏆 *Лидерборд* 🏆\n\n${leaderboard}`, { parse_mode: 'Markdown' });
}

function parseChallengeStartInput(ctx: BotContext) {
    const parts = getMessageText(ctx).trim().split(/\s+/);
    if (parts.length < 3) {
        return null;
    }

    const metric = parseChallengeMetric(parts[1]);
    const durationDays = Number.parseInt(parts[2], 10);
    const title = parts.slice(3).join(' ').trim() || 'Чат-челлендж';

    if (!metric || Number.isNaN(durationDays) || durationDays <= 0) {
        return null;
    }

    return { metric, durationDays, title };
}

function createChallengeDates(durationDays: number) {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return { startsAt, endsAt };
}

async function handleChallengeStartCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /challenge_start from ${ctx.from.id} in chat ${ctx.chat.id}`);

    if (!(await assertAdmin(ctx))) {
        return;
    }

    await sendChallengeAnnouncementIfNeeded(ctx);

    const parsedInput = parseChallengeStartInput(ctx);
    if (!parsedInput) {
        await ctx.reply('Использование: /challenge_start <xp|distance|activities> <days> <title>');
        return;
    }

    const activeChallenge = await getActiveChallengeByChatId(getChatId(ctx));
    if (activeChallenge) {
        await ctx.reply('🚨 В этом чате уже есть активный челлендж.');
        return;
    }

    const { startsAt, endsAt } = createChallengeDates(parsedInput.durationDays);
    const challenge = await createChallenge({
        chatId: getChatId(ctx),
        title: parsedInput.title,
        metric: parsedInput.metric,
        durationDays: parsedInput.durationDays,
        createdByTelegramId: ctx.from.id,
        startsAt,
        endsAt,
    });

    if (!challenge) {
        await ctx.reply('🚨 Не смог создать челлендж. Возможно, активный уже есть.');
        return;
    }

    await ctx.reply(prepareChallengeStartedMessage(challenge), { parse_mode: 'Markdown' });
}

async function handleChallengeJoinCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /challenge_join from ${ctx.from.id} in chat ${ctx.chat.id}`);
    await sendChallengeAnnouncementIfNeeded(ctx);

    const user = await getLinkedUserOrReply(ctx);
    if (!user) {
        return;
    }

    const activeChallenge = await getActiveChallengeByChatId(getChatId(ctx));
    if (!activeChallenge) {
        await ctx.reply('🏁 Сейчас нет активного челленджа.');
        return;
    }

    const joined = await joinChallenge(activeChallenge.id, user.id, new Date());
    const message = joined
        ? '🏁 Ты в челлендже. Теперь всё засчитывается с этого момента.'
        : '🤝 Ты уже в игре.';

    await ctx.reply(message);
}

async function handleChallengeCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /challenge from ${ctx.from.id} in chat ${ctx.chat.id}`);
    await sendChallengeAnnouncementIfNeeded(ctx);

    const activeChallenge = await getActiveChallengeByChatId(getChatId(ctx));
    if (!activeChallenge) {
        await ctx.reply('🏁 Активного челленджа нет.');
        return;
    }

    const [participants, standings, currentUser] = await Promise.all([
        getChallengeParticipants(activeChallenge.id),
        getChallengeStandings(activeChallenge),
        getUserByTelegramId(ctx.from.id),
    ]);

    const message = prepareChallengeStatusMessage(activeChallenge, standings, participants, currentUser?.id);
    await ctx.reply(message, { parse_mode: 'Markdown' });
}

async function stopActiveChallenge(chatId: string): Promise<string | null> {
    return withTransaction(async (client) => {
        const activeChallenge = await getActiveChallengeByChatId(chatId, client);
        if (!activeChallenge) {
            return null;
        }

        const result = await finalizeChallenge({
            challenge: activeChallenge,
            status: 'stopped',
            db: client,
        });

        return result.announcement;
    });
}

async function handleChallengeStopCommand(ctx: BotContext): Promise<void> {
    log('BOT', `Command /challenge_stop from ${ctx.from.id} in chat ${ctx.chat.id}`);

    if (!(await assertAdmin(ctx))) {
        return;
    }

    const announcement = await stopActiveChallenge(getChatId(ctx));
    if (!announcement) {
        await ctx.reply('🏁 Активного челленджа нет.');
        return;
    }

    await ctx.reply(announcement, { parse_mode: 'Markdown' });
}

function parseAddXpInput(ctx: BotContext) {
    const parts = getMessageText(ctx).split(' ');
    if (parts.length < 3) {
        return null;
    }

    const xpToAdd = Number.parseInt(parts[parts.length - 1], 10);
    const username = parts.slice(1, parts.length - 1).join(' ');

    if (!username || Number.isNaN(xpToAdd)) {
        return null;
    }

    return { username, xpToAdd };
}

async function handleAddXpCommand(ctx: BotContext): Promise<void> {
    log('ADMIN', `Command /addxp by ${ctx.from.id}`, getMessageText(ctx));

    if (!(await assertAdmin(ctx))) {
        return;
    }

    const parsedInput = parseAddXpInput(ctx);
    if (!parsedInput) {
        await ctx.reply('Использование: /addxp <username> <XP>');
        return;
    }

    const user = await getUserByUsername(parsedInput.username);
    if (!user) {
        log('ADMIN', `User ${parsedInput.username} not found`);
        await ctx.reply(`🚨 Пользователь ${parsedInput.username} не найден.`);
        return;
    }

    const newXp = user.xp + parsedInput.xpToAdd;
    const newLevelInfo = await findLevelInDb(newXp);
    const newLevel = newLevelInfo.level;

    await updateUserXpAndLevel(user.id, newXp, newLevel);
    log('ADMIN', `Added ${parsedInput.xpToAdd} XP to ${parsedInput.username}. New Level: ${newLevel}`);

    const message = prepareAddXpMessage({
        user,
        xpToAdd: parsedInput.xpToAdd,
        newLevel,
        nextLevelRequiredXp: newLevelInfo.total_required_xp,
    });

    await ctx.reply(message);
}

export function setupBotCommands(bot: Telegraf) {
    bot.command('ping', (ctx) => ctx.reply('pong'));
    bot.command('credit', (ctx) => ctx.replyWithMarkdownV2('[GitHub Repository](https://github.com/YuryHowru/strava-logger-tgbot)'));
    bot.command('auth', createCommandHandler('Error processing /auth', buildAuthErrorMessage, (ctx) => handleAuthCommand(bot, ctx)));
    bot.command('me', createCommandHandler('Error processing /me', '❌ Произошла ошибка при получении информации. Попробуйте позже.', handleMeCommand));
    bot.command('badges', createCommandHandler('Error processing /badges', '❌ Не смог показать медали. Попробуй позже.', handleBadgesCommand));
    bot.command('help', handleHelpCommand);
    bot.command('top', createCommandHandler('Error fetching leaderboard', '❌ Ошибка при получении лидерборда. Попробуйте позже.', handleTopCommand));
    bot.command(
        'challenge_start',
        createCommandHandler('Error processing /challenge_start', '❌ Не получилось запустить челлендж.', handleChallengeStartCommand)
    );
    bot.command(
        'challenge_join',
        createCommandHandler('Error processing /challenge_join', '❌ Не получилось вступить в челлендж.', handleChallengeJoinCommand)
    );
    bot.command(
        'challenge',
        createCommandHandler('Error processing /challenge', '❌ Не смог показать статус челленджа.', handleChallengeCommand)
    );
    bot.command(
        'challenge_stop',
        createCommandHandler('Error processing /challenge_stop', '❌ Не получилось остановить челлендж.', handleChallengeStopCommand)
    );
    bot.command('addxp', createCommandHandler('Error in /addxp', '❌ Не получилось начислить XP.', handleAddXpCommand));
}
