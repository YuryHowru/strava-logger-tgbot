import { Telegraf } from "telegraf";
import strava from 'strava-v3';
import express from 'express';
import sqlite from "sqlite3";
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.BOT_SECRET!);
const app = express();
const DB = new sqlite.Database('strava-bot.db')

strava.config({
  client_id: process.env.STRAVA_ID!,
  client_secret: process.env.STRAVA_SECRET!,
  access_token: process.env.STRAVA_TOKEN!,
  redirect_uri: process.env.APP_URL!,
});

app.use((req, res, next) => {
  if (req.url !== '/healthz') console.log(`[${req.method}] ${req.url}`);
  res.setHeader('Content-Type', 'application/json');
  next();
});

const sendStravaAuthUrl = (ctx: any) => {
  const chatId = ctx.chat.id;
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_ID}&response_type=code&redirect_uri=${process.env.APP_URL}/auth/&approval_prompt=force&scope=read,activity:read&state=${chatId}`;

  ctx.reply(
    '🤖 Физкульты! 👋 Я здесь, чтобы держать всех в чате в курсе ваших тренировок! Пожалуйста, дайте мне доступ к информации о ваших тренировках в Страве.',
    {
      reply_markup: {
      inline_keyboard: [[{ text: 'Авторизовать Страву', url: stravaAuthUrl }]]
      }
    }
  );
}

bot.command('ping', ctx => ctx.reply('pong'));
bot.command('credit', ctx => ctx.replyWithMarkdownV2('[GitHub Repository](https://github.com/YuryHowru/strava-logger-tgbot)'));
bot.command('auth', sendStravaAuthUrl);
bot.command('init', async ctx => {
  try {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        athleteId INTEGER UNIQUE,
        username TEXT NOT NULL,
        chatId INTEGER NOT NULL,
        accessToken TEXT NOT NULL,
        refreshToken TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      )
    `;
    await new Promise<void>((res, rej) => {
      DB.run(createUsersTable, (err) => {
        if (err) return rej(err);

        console.log('[DB] OK. Users table created.');
        res();
      });
    });
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

  sendStravaAuthUrl(ctx);
});

app.get('/auth', async (req, res) => {
  try {
    const { code, state } = req.query as Record<string, string>;
    const chatId = state;

    const tokenResponse = await strava.oauth.getToken(code);
    const { access_token, refresh_token, expires_at, athlete } = tokenResponse;

    await new Promise<void>((res, rej) => {
      DB.run(
      `
        INSERT INTO users (athleteId, accessToken, refreshToken, expiresAt, chatId, username)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(athleteId) DO UPDATE SET
          accessToken = excluded.accessToken,
          refreshToken = excluded.refreshToken,
          expiresAt = excluded.expiresAt,
          chatId = excluded.chatId,
          username = excluded.username
      `,
      [athlete.id, access_token, refresh_token, expires_at, chatId, athlete.username],
      (err) => {
        if (err) return rej(err);
        res()
      }
      );
    });

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
    DB.run(`
      SELECT * FROM USERS 
    `, (res: any, err: any) => {
      if (err) throw err;

      console.log(res);
      res.status(200).send();
    })
  } catch (e) {
    console.log(e);
    return res.status(400).send();
  }
});

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

app.post('/webhook', express.json(), (req, res) => {
  try {
    const { object_type, object_id, aspect_type, owner_id } = req.body;

    console.log(`[ACTIVITY] ${object_type} ${aspect_type}`);
    if (!(object_type == 'activity' && aspect_type === 'create')) {
      return res.status(200).send('OK');
    }

    DB.get<any>("SELECT * FROM users WHERE athleteId = ?", [owner_id], (err, user) => {
      if (err) throw err;

      console.log(`[ACTIVITY] ${JSON.stringify(user)}`);
      
      strava.activities.get({ id: object_id, access_token: user?.accessToken }, (err, activity) => {
        if (err) {
          console.error('Error fetching activity details from Strava:', err);
          return res.status(200).send('OK');
        }

        // Prepare activity details
        const activityName = activity.name;
        const activityType = activity.type;
        const distanceKm = (activity.distance / 1000).toFixed(2); 
        const movingTime = formatTime(activity.moving_time); 
        const elevationGain = activity.total_elevation_gain ? activity.total_elevation_gain.toFixed(2) : '0';
        const pace = calculatePace(activity.moving_time, activity.distance);
        const activityLink = `https://www.strava.com/activities/${object_id}`;

        // Prepare message
        const message = `
          🚴‍♂️🏃‍♂️🏊‍♂️ *${user.username}* был на тренировке, сейчас он дома уже:
          
          *Занятие*: ${activityType} - ${activityName}
          *Дистанция*: ${distanceKm} км
          *Время*: ${movingTime}
          *Темп*: ${pace} мин/км 🔥
          *В горку*: ${elevationGain} метров

          [Открыть в Страве](${activityLink})
        `;

        bot.telegram.sendMessage(user.chatId, message, { parse_mode: 'Markdown' });

        res.status(200).send('OK');
      });
    });
  } catch (e) {
    console.log(e);
    res.status(200).send('OK');
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} ${process.env.APP_URL}`);
});

bot.launch();