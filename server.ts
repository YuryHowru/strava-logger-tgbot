import { Telegraf } from "telegraf";
import strava from 'strava-v3';
import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';

type User = {
  id: number,
  athleteid: number,
  username: string,
  chatid: string,
  accesstoken: string,
  refreshtoken: string,
  expiresat: Date,
  xp: number,
  level: number,
}

dotenv.config();

const bot = new Telegraf(process.env.BOT_SECRET!);
const app = express();
const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
   rejectUnauthorized: false,
  },
  });

strava.config({
  client_id: process.env.STRAVA_ID!,
  client_secret: process.env.STRAVA_SECRET!,
  access_token: process.env.STRAVA_TOKEN!,
  redirect_uri: process.env.APP_URL!,
});

const XP_CONFIG = {
  running: 10,  // 1km
  cycling: 5,   // 1km
  swimming: 50, // 1km
  default: 10,  // 100kkal for other activities
};

function calculateXP(activity: any): number {
  const { type, distance, calories } = activity;

  const xpPerUnit = XP_CONFIG[type] ?? XP_CONFIG.default;
  const isKnownActivity = Object.keys(XP_CONFIG).includes(type);

  let xp = isKnownActivity ? (distance / 1000) * xpPerUnit : (calories / 100) * xpPerUnit;

  return Math.floor(xp);
}

async function getNextLevelInfo(userId: number): Promise<{ level: number; xpToNext: number | null; levelUp: boolean }> {
  const userQuery = await pool.query<User>('SELECT xp, level FROM users WHERE id = $1', [userId]);
  if (!userQuery.rowCount) return;

  let { xp, level } = userQuery.rows[0];

  return await findNewLevel(level, xp);
}

async function findNewLevel(level: number, xp: number): Promise<{ level: number; xpToNext: number | null; levelUp: boolean }> {
  const nextLevelQuery = await pool.query('SELECT required_xp FROM levels WHERE level = $1', [level + 1]);

  if (!nextLevelQuery.rowCount) {
    return { level, xpToNext: null, levelUp: false }; // max level probably
  }

  const requiredXp = nextLevelQuery.rows[0].required_xp;

  if (xp < requiredXp) {
    return { level, xpToNext: requiredXp - xp, levelUp: false };
  }

  return findNewLevel(level + 1, xp);
}

async function updateUserXP(userId, earnedXP) {
  await pool.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [earnedXP, userId]);
  const { level, xpToNext, levelUp } = await getNextLevelInfo(userId);

  if (levelUp) {
    await pool.query('UPDATE users SET level = level + 1 WHERE id = $1', [userId]);
    return { earnedXP, level, levelUp: true };
  }
  return { earnedXP, level, xpToNext, levelUp: false };
}

async function processActivity(activity, userId) {
  const earnedXP = await calculateXP(activity);
  const xpUpdate = await updateUserXP(userId, earnedXP);

  let message = `🏅 Вы получили *${earnedXP} XP* за тренировку!\n`;
  if (xpUpdate.levelUp) {
    message += `🎉 Поздравляем, у вас новый уровень: *${xpUpdate.level}*!`;
  } else {
    message += `📈 Осталось *${xpUpdate.xpToNext} XP* до следующего уровня.`;
  }
  
  return message;
}


function getStravaAuthUrl(chatId: any) {
  return `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_ID}&response_type=code&redirect_uri=${process.env.APP_URL}/auth/&approval_prompt=force&scope=read,activity:read&state=${chatId}`;
}


app.use((req, res, next) => {
  if (req.url !== '/healthz') console.log(`[${req.method}] ${req.url}`);
  res.setHeader('Content-Type', 'application/json');
  next();
});

bot.command('ping', ctx => ctx.reply('pong'));
bot.command('credit', ctx => ctx.replyWithMarkdownV2('[GitHub Repository](https://github.com/YuryHowru/strava-logger-tgbot)'));
bot.command('auth', (ctx: any) => {
  ctx.reply(
    '🤖',
    {
      reply_markup: {
      inline_keyboard: [[{ text: 'Авторизовать Страву', url: getStravaAuthUrl(ctx.chat.id) }]]
      }
    }
  );
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
      athlete.id,        // $1
      access_token,      // $2
      refresh_token,     // $3
      expires_at,        // $4
      chatId,            // $5
      athlete.username,  // $6
    ];

    const user = await pool.query(queryText, values);
    console.log(`[AUTH] User:`, user);

    bot.telegram.sendMessage(chatId, `🎉 ${athlete.firstname} ${athlete.lastname} профессионально подключил Страву!`);
    
    res.send('Всё сработало, можно закрывать это окно.');
  } catch (error) {
    console.log(error);
    res.status(500).send('Server error');
  }
});

app.get('/healthz', (_, res) => res.status(200).send({status: 'running'}));

app.get('/setup-webhooks', async (req, res) => {
  try {
    await strava.pushSubscriptions.create({
      client_id: process.env.STRAVA_ID!,
      client_secret: process.env.STRAVA_SECRET!,
      callback_url: `${process.env.APP_URL}/webhook`,
      verify_token: 'WEBHOOK_VERIFY',
    });

    res.status(200).send({status: 'ok'});
  } catch (e) {
    res.status(400).send(e);
  }
})

app.get('/subs', async (req, res) => {
  try {
    const list = await strava.pushSubscriptions.list();
    console.log(list);
    res.status(200).send();
  } catch (e) {
    console.log(e);
    res.status(400).send();
  }
})

app.get('/users', async (req, res) => {
  try {
    const allUsers = await pool.query(`SELECT * FROM USERS`);
    console.log(allUsers);

    res.status(200).send({status: 'ok'});
  } catch (e) {
    console.log(e);
    return res.status(400).send();
  }
});

app.get('/setup-table', async (req, res) => {
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
    res.status(200).send({table});
  } catch (e) {
    console.log(e);
    res.status(400).send({error: e});
  }
})

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === 'WEBHOOK_VERIFY') {
      console.log('Webhook verified');
      res.status(200).send({ "hub.challenge": challenge });
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
  if (distance === 0) return "N/A";
  
  const paceInSecondsPerKm = movingTime / (distance / 1000);
  const mins = Math.floor(paceInSecondsPerKm / 60);
  const secs = Math.floor(paceInSecondsPerKm % 60);

  const paddedSecs = secs.toString().padStart(2, '0');

  return `${mins}:${paddedSecs}`;
}

app.post('/webhook', express.json(), async (req, res) => {
  try {
    const { object_type, object_id, aspect_type, owner_id } = req.body;

    console.log(`[ACTIVITY] ${object_type} ${aspect_type}`);
    if (!(object_type === 'activity' && aspect_type === 'create')) {
      return res.status(200).send('OK');
    }

    const result = await pool.query('SELECT * FROM users WHERE athleteId = $1', [owner_id]);
    const user: User = result.rows[0];

    if (!user) {
      console.log(`No user found with athleteId ${owner_id}`);
      return res.status(200).send('OK');
    }

    console.log(`[ACTIVITY] User:`, user);

    if (user.expiresat <= new Date()) {
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
        [
          refreshResult.access_token,
          refreshResult.refresh_token,
          refreshResult.expires_at,
          user.athleteid,
        ]
      );

      user.accesstoken = refreshResult.access_token;
      user.refreshtoken = refreshResult.refresh_token;
      user.expiresat = refreshResult.expires_at;

      console.log('Tokens refreshed successfully!');
    }
  
    const activity = await new Promise<any>((resolve) => strava.activities.get({ id: object_id, access_token: user.accesstoken }, (err, activity) => {
      if (err) {
        console.error('Error fetching activity details from Strava:', err);
        return res.status(200).send('OK');
      }
      resolve(activity);
    }));
    
    const activityType = activity.type;
    const activityName = activity.name;
    const movingTime = formatTime(activity.moving_time);
    const activityLink = `https://www.strava.com/activities/${object_id}`;
    let message: string;
    if (activityType === 'WeightTraining' || activityType === 'Workout') {
      // Если тренировка не имеет дистанции (например, силовая тренировка)
      const calories = activity.calories ? `${activity.calories.toFixed(2)} ккал` : 'неизвестно';
      const description = activity.description || 'Нет описания';
  
      message = `
        💪 *${user.username}* завершил силовую тренировку! 
  
        *Занятие*: ${activityType} - ${activityName}
        *Продолжительность*: ${movingTime}
        *Потраченные калории*: ${calories}
        *Описание*: ${description}
  
        [Открыть в Страве](${activityLink})
      `;
    } else {
      // Prepare activity details

      const distanceKm = (activity.distance / 1000).toFixed(2);

      const elevationGain = activity.total_elevation_gain ? activity.total_elevation_gain.toFixed(2) : '0';
      const pace = calculatePace(activity.moving_time, activity.distance);

      // Prepare the message
      message = `
          🚴‍♂️🏃‍♂️🏊‍♂️ *${user.username}* был на тренировке, сейчас он дома уже:
          
          *Занятие*: ${activityType} - ${activityName}
          *Дистанция*: ${distanceKm} км
          *Время*: ${movingTime}
          *Темп*: ${pace} мин/км 🔥
          *В горку*: ${elevationGain} метров

          [Открыть в Страве](${activityLink})
      `;
    }

    bot.telegram.sendMessage(user.chatid, message, { parse_mode: 'Markdown' });
    res.status(200).send('OK');
  } catch (e) {
    console.error(e);
    res.status(200).send('OK');
  }
});

app.get('/ping', (req, res) => {
  res.status(200).send({status: 'ok'});
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} ${process.env.APP_URL}`);

  setInterval(async () => {
    await fetch(`${process.env.APP_URL}/ping`)
  }, 14 * 60 * 1000);
});

bot.launch();