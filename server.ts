import { Telegraf } from 'telegraf';
import strava, { DetailedActivityResponse } from 'strava-v3';
import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';

type User = {
    id: number;
    athleteid: number;
    username: string;
    chatid: string | number;
    accesstoken: string;
    refreshtoken: string;
    expiresat: Date;
    xp: number;
    level: number;
    is_admin: boolean;
    streak_count: number;
    last_activity: Date | null;
};

type LevelInfo = {
    level: number;
    required_xp: number;
    total_required_xp: number;
};

dotenv.config();

const bot = new Telegraf(process.env.BOT_SECRET!);
const app = express();
const pool = new Pool({
    connectionString: process.env.DB_URL,
    ssl: false,
});

strava.config({
    client_id: process.env.STRAVA_ID!,
    client_secret: process.env.STRAVA_SECRET!,
    access_token: process.env.STRAVA_TOKEN!,
    redirect_uri: process.env.APP_URL!,
});

const DISTANCE_BASED_ACTIVITIES = [
    'Run',
    'TrailRun',
    'Walk',
    'Hike',
    'VirtualRun',
    'Ride',
    'MountainBikeRide',
    'GravelRide',
    'E-BikeRide',
    'VirtualRide',
    'Swim',
    'Rowing',
    'Kayak',
    'StandUpPaddling',
    'AlpineSki',
    'BackcountrySki',
    'NordicSki',
    'Snowboard',
    'IceSkate',
    'InlineSkate',
];

const verbsByActivity = {
    // Бег (Run)
    Run: [
        'бегает 5 раз в неделю (нет)',
        'делает вид что бегает',
        'начинает готовиться к марафону',
        'завтра будет ходить как пингвин',
        'бегал, странно но факт',
        'бегал, странно но майка сухая и совсем не пахнет',
        'бежал, будто за ним гонятся коллекторы',
        'просто хотел догнать автобус, но увлекся',
        'перешел в режим "турбо-улитка"',
        'собирает лайки своими ногами',
        'дышал как паровоз, но не сдавался',
        'бегал. Спонсор тренировки — сила воли и слабоумие',
    ],
    // Силовая (WeightTraining)
    WeightTraining: [
        'уничтожил тренировку',
        'поднимал тяжести (никто не просил)',
        'здесь могла быть ваша реклама',
        'медленно превращается в терминатора',
        'качал что угодно, но не ноги',
        'искал анаболическое окно (и нашел сквозняк)',
        'поднял самооценку (и немного железа)',
        'делал селфи в спортзале вместо подходов',
        'ждал, пока освободится скамья для жима',
        'пытался стать шириной с дверной проем',
        'разбрасывал гантели по всему залу',
        'качал бицепс, чтобы рубашки трещали',
        'готовится к битве с боссом',
        'включил режим "Халк крушить"',
    ],
    // Плавание (PoolSwim)
    PoolSwim: [
        'намотал круги в бассейне',
        'думает что плавать туда сюда весело',
        'будет говорить, что проплыл столько:',
        'пересёк бассейн много раз',
        'мешал другим на водной дорожке',
        'чувствовал себя рыбой',
        'пошёл ко дну',
        'плыл хорошо, но не быстро',
        'плыл почти как Корнилова',
        'пошёл ко дну',
        'теперь пахнет хлоркой, как элитная уборщица',
        'выпил половину бассейна, пока плыл',
        'притворялся дельфином, но получился тюлень',
        'боролся с запотевшими очками (очки победили)',
        'Майкл Фелпс на минималках',
        'теперь вода в ухе будет булькать до вечера',
        'отрастил жабры',
    ],
    // Другие активности
    TrailRun: ['пробежался по тропе', 'покорил трейл', 'исследовал новые тропы'],
    Walk: ['прогулялся', 'намотал круги', 'отправился на променад'],
    Hike: ['пошёл в поход', 'сходил в горы', 'покорил вершину'],
    Ride: ['прокатился', 'покрутил педали', 'дал жару'],
    MountainBikeRide: ['зарулился в горы', 'погонял по бездорожью'],
    GravelRide: ['исследовал гравий', 'прокатился по грунтовке'],
    'E-BikeRide': ['прокатился на электровеле', 'устроил прогулку с ветерком'],
    Swim: ['поплавал', 'переплыл реку', 'покорил водную гладь'],
    Rowing: ['погреб', 'устроил заплыв', 'отправился в регату'],
    Kayak: ['погреб', 'устроил сплав'],
    StandUpPaddling: ['покатался на сапе'],
    AlpineSki: ['покатался на лыжах'],
    BackcountrySki: ['покорил снежные склоны'],
    NordicSki: ['пошёл на лыжную прогулку'],
    Snowboard: ['покатался на сноуборде'],
    Workout: ['потренировался', 'вспотел в зале'],
    Yoga: ['позанимался йогой', 'достиг гармонии', 'тянул-потянул'],
    Crossfit: ['устроил кроссфит', 'уничтожал WOD'],
    RockClimb: ['покорил стену', 'залез на скалодром'],
    default: ['завершил тренировку'],
};

const emojiByActivity = {
    Run: '🏃‍♂️',
    TrailRun: '🏃‍♀️',
    Walk: '🚶‍♂️',
    Hike: '🥾',
    Ride: '🚴‍♂️',
    MountainBikeRide: '🚵‍♀️',
    GravelRide: '🚴',
    'E-BikeRide': '🚲⚡️',
    VirtualRide: '🚴‍♀️🎮',
    Swim: '🏊‍♂️',
    PoolSwim: '🏊‍♀️',
    Rowing: '🚣‍♂️',
    Kayak: '🛶',
    StandUpPaddling: '🏄',
    AlpineSki: '⛷️',
    BackcountrySki: '⛷️🏔️',
    NordicSki: '🎿',
    Snowboard: '🏂',
    Workout: '🏋️',
    Yoga: '🧘‍♀️',
    WeightTraining: '💪',
    Crossfit: '🤸‍♂️🏋️‍♂️',
    RockClimb: '🧗‍♂️',
    default: '🚀',
};

const XP_CONFIG = {
    // Run walk
    Run: 10,
    TrailRun: 12,
    Walk: 6,
    Hike: 8,
    VirtualRun: 10,

    // Bike
    Ride: 5,
    MountainBikeRide: 7,
    GravelRide: 6,
    ['E-BikeRide']: 3,
    VirtualRide: 5,

    // Water
    Swim: 50,
    Rowing: 30,
    Kayak: 25,
    StandUpPaddling: 20,

    // Winter
    AlpineSki: 12,
    BackcountrySki: 15,
    NordicSki: 14,
    Snowboard: 10,

    // Strength and others
    Workout: 25,
    Yoga: 12.5,
    WeightTraining: 30,
    Crossfit: 37.5,
    RockClimb: 37.5,

    default: 10,
};
const MAX_LVL = 20;

const getStreakData = (user: User, activityDate: number) => {
    const today = new Date(activityDate * 1000);
    today.setHours(0, 0, 0, 0);

    const FIXED_MULTIPLIER = 1.25;

    let newStreak = 1;
    let xpMultiplier = 1;

    let streakMessage = `
🚀 Серия тренировок - 1 день.
Продолжив завтра, получишь бонус *${FIXED_MULTIPLIER}x*!
    `;

    const getDaysWord = (num: number) => {
        if (num >= 5 && num <= 20) return 'дней';
        const lastDigit = num % 10;
        if (lastDigit === 1) return 'день';
        if (lastDigit >= 2 && lastDigit <= 4) return 'дня';
        return 'дней';
    };

    if (!user.last_activity) {
        return { message: streakMessage, xpMultiplier, newStreak };
    }

    const lastDate = new Date(user.last_activity);
    lastDate.setHours(0, 0, 0, 0);
    const dayDifference = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (dayDifference > 1) {
        return { message: streakMessage, xpMultiplier, newStreak };
    }

    if (dayDifference === 1) {
        newStreak = user.streak_count + 1;
        xpMultiplier = FIXED_MULTIPLIER;

        streakMessage = `
💥 Серия тренировок — *${newStreak} ${getDaysWord(newStreak)} подряд*!!
Активен бонус серии: *${FIXED_MULTIPLIER}x* к XP!
        `;
        return { message: streakMessage, xpMultiplier, newStreak };
    }

    // Если тренировка в тот же день (кейс 3)
    if (dayDifference === 0) {
        newStreak = user.streak_count;
        // Если серия уже была накоплена (>1 дня), бонус действует и на вторую тренировку за день
        xpMultiplier = newStreak > 1 ? FIXED_MULTIPLIER : 1;

        streakMessage = `
💪 Легенда. Несколько тренировок в один день.
${
    newStreak > 1
        ? `Бонус серии *${FIXED_MULTIPLIER}x* всё ещё работает!`
        : `Продолжай завтра, чтобы получить бонус *${FIXED_MULTIPLIER}x*!`
}
        `;
        return { message: streakMessage, xpMultiplier, newStreak };
    }

    return { streakMessage, xpMultiplier, newStreak };
};

function getBeautifulStatus(activity: any): { beautifulBonusXp: number; beautifulBonusMessage: string } {
    let bonusXp = 0;
    const messages: string[] = [];

    if (activity.distance && activity.distance > 0) {
        const km = activity.distance / 1000;
        const kmStr = km.toFixed(2);
        const [intPart, decPart] = kmStr.split('.');

        if (decPart === '00') {
            bonusXp += 20;
            messages.push('🎯 Снайпер! Ровная дистанция (+20 XP)');
        } else if (intPart === decPart || (intPart.length === 1 && decPart[0] === intPart && decPart[1] === intPart)) {
            bonusXp += 30;
            messages.push(`💎 Магия чисел (${kmStr} км) (+30 XP)`);
        }
    }

    if (activity.moving_time && activity.moving_time > 0) {
        const minutes = Math.floor((activity.moving_time % 3600) / 60);
        const seconds = activity.moving_time % 60;

        if (seconds === 0 && minutes > 0) {
            bonusXp += 15;
            messages.push('⌚️ Педант! Ровное время (+15 XP)');
        }
        // Паттерн: Синхронизация -> 12:12, 44:44
        else if (minutes === seconds && minutes !== 0) {
            bonusXp += 15;
            messages.push(`⏱ Синхронизация времени ${minutes}:${seconds} (+15 XP)`);
        }
    }

    if (activity.calories && activity.calories > 0) {
        const cal = Math.round(activity.calories);
        const calStr = cal.toString();

        if (cal % 100 === 0) {
            bonusXp += 20;
            messages.push(`🍔 Ровный аппетит (${cal} ккал) (+20 XP)`);
        } else if (cal > 10 && calStr.split('').every((char) => char === calStr[0])) {
            bonusXp += 40;
            messages.push(`🎰 Калорийный джекпот (${cal} ккал) (+40 XP)`);
        }
    }

    return {
        beautifulBonusXp: bonusXp,
        beautifulBonusMessage: messages.join('\n'),
    };
}

function calculateEarnedXp(activity: any, xpMultiplier: number): number {
    const { type, distance, calories } = activity;
    const xpPerUnit = XP_CONFIG[type] ?? XP_CONFIG.default;

    if (DISTANCE_BASED_ACTIVITIES.includes(type)) {
        return Math.floor((distance / 1000) * xpPerUnit * xpMultiplier);
    }

    return Math.floor((calories / 100) * xpPerUnit * xpMultiplier);
}
async function findLevelInDb(xp: number): Promise<LevelInfo & { total_required_xp: number }> {
    const levelsQuery = await pool.query<LevelInfo>(`
    SELECT * FROM levels ORDER BY level ASC
  `);

    const levels = levelsQuery.rows;
    if (!levels.length) throw new Error(`[DB] Levels table is empty!`);

    return levels.find(({ total_required_xp }) => total_required_xp > xp)!;
}

async function calculateLevelInfo({
    activity,
    user,
    xpMultiplier,
    beautifulBonusXp,
}: {
    activity: any;
    user: User;
    xpMultiplier: number;
    beautifulBonusXp: number;
}): Promise<{ earnedXp: number; newLevel: number; nextLevelRequiredXp: number }> {
    const baseXp = calculateEarnedXp(activity, xpMultiplier);
    const earnedXp = baseXp + beautifulBonusXp;

    const newXp = user.xp + earnedXp;
    const newLevelInfo = await findLevelInDb(newXp);

    return { earnedXp: earnedXp, newLevel: newLevelInfo.level, nextLevelRequiredXp: newLevelInfo.total_required_xp };
}

function prepareGamifyMessage({ user, earnedXp, newLevel, nextLevelRequiredXp, xpMultiplier }) {
    if (user.level === MAX_LVL) {
        return `Lvl ${MAX_LVL}. (Max level reached)`;
    }

    const newXp = user.xp + earnedXp;
    let multiMessage = '';
    if (xpMultiplier > 1) multiMessage = ` (*${xpMultiplier.toFixed(2)}x*)`;
    const levelUpMessage =
        newLevel > user.level ? `🎉 *LEVEL UP!* Добро пожаловать на *${newLevel} уровень!* 🚀\n` : '';

    let message = '';
    if (levelUpMessage) message += levelUpMessage + '\n';
    message += `
🔥 Распишитесь и получите *${earnedXp}* XP${multiMessage}!!
🏆 Уровень: *${newLevel}*, ${newXp}/${nextLevelRequiredXp} XP
  `;

    return message;
}

async function refreshUserToken(user: User) {
    const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: process.env.STRAVA_ID,
            client_secret: process.env.STRAVA_SECRET,
            grant_type: 'refresh_token',
            refresh_token: user.refreshtoken,
        }),
    });

    const refreshResult = await response.json();

    await pool.query(
        `UPDATE users
        SET accesstoken = $1, refreshtoken = $2, expiresat = $3
        WHERE athleteid = $4`,
        [refreshResult.access_token, refreshResult.refresh_token, refreshResult.expires_at, user.athleteid]
    );

    user.accesstoken = refreshResult.access_token;
    user.refreshtoken = refreshResult.refresh_token;
    user.expiresat = refreshResult.expires_at;

    console.log('Tokens refreshed successfully!');
}
function prepareActivityMessage({ activity, user }) {
    const activityType = activity.type;
    const activityName = activity.name;
    const movingTime = formatTime(activity.moving_time);
    const verbs = verbsByActivity[activityType] ?? verbsByActivity.default;
    const randomNumber = Math.floor(Math.random() * verbs.length);
    const randomVerb = verbs[randomNumber];

    if (activity.distance) {
        const distanceKm = (activity.distance / 1000).toFixed(2);

        const elevationGain = activity.total_elevation_gain ? activity.total_elevation_gain.toFixed(2) : '0';
        const pace = calculatePace(activity.moving_time, activity.distance);
        return `
        ${emojiByActivity[activityType]} *${user.username}* ${randomVerb}

        *${activityName}*
        *Дистанция*: ${distanceKm} км
        *Время*: ${movingTime}
        *Темп*: ${pace} мин/км 🔥
        *В горку*: ${elevationGain} метров
    `;
    }

    return `
      ${emojiByActivity[activityType]} *${user.username}* ${randomVerb}

      *${activityName}*
      *Продолжительность*: ${movingTime}
      *Потраченные калории*: ${activity.calories.toFixed(2)} ккал
    `;
}
function getStravaAuthUrl(chatId: any) {
    return `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_ID}&response_type=code&redirect_uri=${process.env.APP_URL}/auth/&approval_prompt=force&scope=read,activity:read&state=${chatId}`;
}
app.use((req, res, next) => {
    if (req.url !== '/healthz') console.log(`[${req.method}] ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    next();
});
bot.command('ping', (ctx) => ctx.reply('pong'));
bot.command('credit', (ctx) =>
    ctx.replyWithMarkdownV2('[GitHub Repository](https://github.com/YuryHowru/strava-logger-tgbot)')
);
bot.command('auth', (ctx: any) => {
    console.log(ctx);
    ctx.reply('🤖', {
        reply_markup: {
            inline_keyboard: [[{ text: 'Авторизовать Страву', url: getStravaAuthUrl(ctx.chat.id) }]],
        },
    });
});
// bot.command('init', async ctx => {
//   try {
//     const createUsersTable = `
//       CREATE TABLE IF NOT EXISTS users (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         athleteId INTEGER UNIQUE,
//         username TEXT NOT NULL,
//         chatId BIGINT NOT NULL,
//         accessToken TEXT NOT NULL,
//         refreshToken TEXT NOT NULL,
//         expiresAt INTEGER NOT NULL
//       )
//     `;
//     const table = await pool.query(createUsersTable, []);
//     console.log(`[DB] OK`, table);
//   } catch (e: any) {
//     console.log('[DB ERROR]', e);
//     return ctx.reply(e.message);
//   }

//   try {
//     await strava.pushSubscriptions.create({
//       client_id: process.env.STRAVA_ID!,
//       client_secret: process.env.STRAVA_SECRET!,
//       callback_url: `${process.env.APP_URL}/webhook`,
//       verify_token: 'WEBHOOK_VERIFY',
//     });
//   } catch (e: any) {
//     console.log('[SUB ERROR]', e.error)
//   }

//   ctx.reply(getStravaAuthUrl(ctx.chat.id))
// });

function getFullActivityInfo({ activityId, userAccessToken }) {
    return new Promise<DetailedActivityResponse>((resolve, reject) =>
        strava.activities.get({ id: activityId, access_token: userAccessToken }, (err, activity) => {
            if (err) {
                return reject({ message: 'Error fetching activity details from Strava', err });
            }

            resolve(activity);
        })
    );
}

app.get('/auth', async (req, res) => {
    try {
        const { code, state } = req.query as Record<string, string>;
        const chatId = state;

        const tokenResponse = await strava.oauth.getToken(code);
        const { access_token, refresh_token, expires_at, athlete } = tokenResponse;

        console.log(`[AUTH] Athlete:`, athlete);

        const queryText = `
      INSERT INTO users (athleteId, accessToken, refreshToken, expiresAt, chatId, username)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (athleteId) DO UPDATE SET
        accessToken = EXCLUDED.accessToken,
        refreshToken = EXCLUDED.refreshToken,
        expiresAt = EXCLUDED.expiresAt,
        chatId = EXCLUDED.chatId,
        username = EXCLUDED.username
    `;

        const values = [
            athlete.id, // $1
            access_token, // $2
            refresh_token, // $3
            expires_at, // $4
            chatId, // $5
            athlete.username ?? `${athlete.firstname} ${athlete.lastname}`, // $6
        ];

        const user = await pool.query(queryText, values);
        console.log(`[AUTH] User:`, user);

        bot.telegram.sendMessage(
            chatId,
            `🎉 ${athlete.firstname} ${athlete.lastname} профессионально подключил Страву!`
        );

        res.send('Всё сработало, можно закрывать это окно.');
    } catch (error) {
        console.log(error);
        res.status(500).send('Server error');
    }
});
bot.command('me', async (ctx) => {
    try {
        const result = await pool.query<User>('SELECT * FROM users WHERE telegram_id = $1', [ctx.from.id]);
        const user = result.rows[0];

        if (!user) {
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
        console.error('Error processing /info command:', error);
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
        const topUsersQuery = await pool.query<User>(`
      SELECT username, level, xp
      FROM users
      ORDER BY level DESC, xp DESC
      LIMIT 10;
    `);

        const topUsers = topUsersQuery.rows;

        const leaderboard = topUsers
            .map((user, index) => `${index + 1}. *${user.username}* — ${user.level} lvl (${user.xp} XP)`)
            .join('\n');

        const message = `🏆 *Лидерборд* 🏆\n\n${leaderboard}`;

        ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('[DB] Error fetching leaderboard:', error);
        ctx.reply('❌ Ошибка при получении лидерборда. Попробуйте позже.');
    }
});

app.get('/healthz', (_, res) => res.status(200).send({ status: 'running' }));

app.get('/setup-webhooks', async (_, res) => {
    try {
        await strava.pushSubscriptions.create({
            client_id: process.env.STRAVA_ID!,
            client_secret: process.env.STRAVA_SECRET!,
            callback_url: `${process.env.APP_URL}/webhook`,
            verify_token: 'WEBHOOK_VERIFY',
        });

        res.status(200).send({ status: 'ok' });
    } catch (e) {
        res.status(400).send(e);
    }
});

app.get('/subs', async (_, res) => {
    try {
        const list = await strava.pushSubscriptions.list();
        console.log(list);
        res.status(200).send();
    } catch (e) {
        console.log(e);
        res.status(400).send();
    }
});

app.get('/users', async (_, res) => {
    try {
        const allUsers = await pool.query(`SELECT * FROM USERS`);
        console.log(allUsers);

        res.status(200).send({ status: 'ok' });
    } catch (e) {
        console.log(e);
        return res.status(400).send();
    }
});

app.get('/setup-table', async (_, res) => {
    try {
        const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        athleteId INTEGER UNIQUE,
        username TEXT NOT NULL,
        chatId INTEGER NOT NULL,
        accessToken TEXT NOT NULL,
        refreshToken TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      )
    `;
        const table = await pool.query(createUsersTable, []);
        console.log(`[DB] OK`, table);
        res.status(200).send({ table });
    } catch (e) {
        console.log(e);
        res.status(400).send({ error: e });
    }
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === 'WEBHOOK_VERIFY') {
            console.log('Webhook verified');
            res.status(200).send({ 'hub.challenge': challenge });
        } else {
            res.sendStatus(403);
        }
    }
});

function formatTime(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const paddedHrs = hrs.toString().padStart(2, '0');
    const paddedMins = mins.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');

    return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
}

function calculatePace(movingTime: number, distance: number) {
    if (distance === 0) return 'N/A';

    const paceInSecondsPerKm = movingTime / (distance / 1000);
    const mins = Math.floor(paceInSecondsPerKm / 60);
    const secs = Math.floor(paceInSecondsPerKm % 60);

    const paddedSecs = secs.toString().padStart(2, '0');

    return `${mins}:${paddedSecs}`;
}

app.post('/webhook', express.json(), async (req, res) => {
    res.status(200).send('OK'); // must respond instantly because Strava will repeat POST if not ?

    try {
        const { object_type, object_id, aspect_type, owner_id, event_time } = req.body;
        console.log(`[ACTIVITY] ${object_type} ${aspect_type}`);
        console.log(req.body);

        if (!(object_type === 'activity' && aspect_type === 'create')) {
            return;
        }

        const result = await pool.query<User>('SELECT * FROM users WHERE athleteId = $1', [owner_id]);
        const user = result.rows[0];

        if (!user) {
            console.error(`[DB] User id ${owner_id} not found.`);
            return;
        }

        console.log(`[ACTIVITY] User:`, user);

        if (user.expiresat <= new Date()) await refreshUserToken(user);

        const activity = await getFullActivityInfo({ activityId: object_id, userAccessToken: user.accesstoken });
        const { streakMessage, newStreak, xpMultiplier } = getStreakData(user, event_time);
        const { beautifulBonusXp, beautifulBonusMessage } = getBeautifulStatus(activity);
        const { newLevel, earnedXp, nextLevelRequiredXp } = await calculateLevelInfo({
            activity,
            user,
            xpMultiplier,
            beautifulBonusXp,
        });
        const newXp = user.xp + earnedXp;
        const activityDetailsMessage = prepareActivityMessage({ activity, user });
        const gamifyMessage = prepareGamifyMessage({ user, earnedXp, newLevel, nextLevelRequiredXp, xpMultiplier });

        const activityLink = `https://www.strava.com/activities/${object_id}`;
        let message = `
      ${activityDetailsMessage}
${gamifyMessage}
${streakMessage}
    `;

        if (beautifulBonusMessage) {
            message += `\n${beautifulBonusMessage}\n`;
        }
        message += `\n\n[Открыть в Страве](${activityLink})`;
        bot.telegram.sendMessage(user.chatid, message, { parse_mode: 'Markdown' });

        await pool.query(
            `
          UPDATE users
          SET xp = $1, level = $2, last_activity = to_timestamp($3), streak_count = $4
          WHERE id = $5`,
            [newXp, newLevel, event_time, newStreak, user.id]
        );
    } catch (e) {
        console.error(e);
    }
});

app.get('/ping', (_, res) => {
    res.status(200).send({ status: 'ok' });
});

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT} ${process.env.APP_URL}`);

    // hack to keep Render free server awake (sleep after 15min inactivity)
    setInterval(async () => {
        await fetch(`${process.env.APP_URL}/ping`);
    }, 14 * 60 * 1000);
});

function prepareAddXpMessage({ user, xpToAdd, newLevel, nextLevelRequiredXp }) {
    if (user.level === MAX_LVL) {
        return `Lvl ${MAX_LVL}. (Max level reached)`;
    }

    const newXp = user.xp + xpToAdd;
    const levelUpMessage = newLevel > user.level ? `🎉 LEVEL UP! 🚀 ` : '';

    return `
    🔥 ${user.username} получает +${xpToAdd} XP! А так можно было?
    🏆 ${levelUpMessage}Уровень: ${newLevel}, ${newXp}/${nextLevelRequiredXp} XP
  `;
}

bot.command('addxp', async (ctx) => {
    const senderResult = await pool.query<User>(`SELECT is_admin FROM users WHERE telegram_id = $1`, [ctx.from.id]);
    const sender = senderResult.rows[0];
    if (!sender || !sender.is_admin) {
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
        const userResult = await pool.query<User>(`SELECT * FROM users WHERE username = $1`, [username]);
        const user = userResult.rows[0];

        if (!user) {
            return ctx.reply(`🚨 Пользователь ${username} не найден.`);
        }

        const newXp = user.xp + xpToAdd;
        const newLevelInfo = await findLevelInDb(newXp);
        const newLevel = newLevelInfo.level;

        await pool.query(`UPDATE users SET xp = $1, level = $2 WHERE id = $3`, [newXp, newLevel, user.id]);

        const nextLevelRequiredXp = newLevelInfo.total_required_xp;
        const message = prepareAddXpMessage({ user, xpToAdd, newLevel, nextLevelRequiredXp });
        ctx.reply(message);
    } catch (error) {
        console.error('Error in /addxp command:', error);
    }
});

bot.launch();
