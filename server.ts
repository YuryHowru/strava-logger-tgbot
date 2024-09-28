import { Telegraf } from "telegraf";
import strava from 'strava-v3';
import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const bot = new Telegraf(process.env.BOT_SECRET!);
const app = express();
const pool = new Pool({
  connectionString: process.env.DB_URL, // Use DATABASE_URL from your environment variables
  ssl: {
   rejectUnauthorized: false, // For local development and cloud environments
  },
  });

strava.config({
  client_id: process.env.STRAVA_ID!,
  client_secret: process.env.STRAVA_SECRET!,
  access_token: process.env.STRAVA_TOKEN!,
  redirect_uri: process.env.APP_URL!,
});

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
bot.command('init', async ctx => {
  try {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        athleteId INTEGER UNIQUE,
        username TEXT NOT NULL,
        chatId BIGINT NOT NULL,
        accessToken TEXT NOT NULL,
        refreshToken TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      )
    `;
    const table = await pool.query(createUsersTable, []);
    console.log(`[DB] OK`, table);
  } catch (e: any) {
    console.log('[DB ERROR]', e);
    return ctx.reply(e.message);
  }

  try {
    await strava.pushSubscriptions.create({
      client_id: process.env.STRAVA_ID!,
      client_secret: process.env.STRAVA_SECRET!,
      callback_url: `${process.env.APP_URL}/webhook`,
      verify_token: 'WEBHOOK_VERIFY',
    });
  } catch (e: any) {
    console.log('[SUB ERROR]', e.error)
  }

  ctx.reply(getStravaAuthUrl(ctx.chat.id))
});
bot.command('status', async (ctx) => {
  const chatId = ctx.chat.id;

  try {
    const userQuery = `
      SELECT athleteId, username, expiresAt FROM users WHERE chatId = $1
    `;
    const { rows } = await pool.query(userQuery, [chatId]);

    if (rows.length === 0) {
      bot.telegram.sendMessage(ctx.chat.id, '😢 *Вы не авторизованы.* Используйте /auth', {parse_mode: 'Markdown'})
      return;
    }

    const user = rows[0];

    const message = `
      *Имя пользователя:* ${user.username}
      *Статус:* '✅ Авторизован'
    `;

    // Send the response
    bot.telegram.sendMessage(ctx.chat.id, message, {parse_mode: 'Markdown'})
    ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error fetching user status:', error);
    ctx.reply('🚨 Произошла ошибка при получении статуса. Попробуйте снова позже.');
  }
});

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
    const user = result.rows[0];

    if (!user) {
      console.log(`No user found with athleteId ${owner_id}`);
      return res.status(200).send('OK');
    }

    console.log(`[ACTIVITY] User:`, user);

    if (user.expiresAt <= new Date()) {
      const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_ID,
          client_secret: process.env.STRAVA_SECRET,
          grant_type: 'refresh_token',
          refresh_token: user.refreshToken,
        }),
      });

      const refreshResult = await response.json();

      await pool.query(
        `UPDATE users 
          SET accessToken = $1, refreshToken = $2, expiresAt = $3 
          WHERE athleteId = $4`,
        [
          refreshResult.access_token,
          refreshResult.refresh_token,
          refreshResult.expires_at,
          user.athleteId,
        ]
      );

      user.accessToken = refreshResult.access_token;
      user.refreshToken = refreshResult.refresh_token;
      user.expiresAt = refreshResult.expires_at;

      console.log('Tokens refreshed successfully!');
    }
  
    const activity = await new Promise<any>((resolve) => strava.activities.get({ id: object_id, access_token: user.accessToken }, (err, activity) => {
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

    bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'Markdown' });
    res.status(200).send('OK');
  } catch (e) {
    console.error(e);
    res.status(200).send('OK');
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} ${process.env.APP_URL}`);
});

bot.launch();