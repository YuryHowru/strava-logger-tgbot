import { getUserByAthleteId, updateUserStats } from '../../infrastructure/database/service';
import { refreshUserToken } from '../../features/auth/service';
import { getStreakData } from '../../features/activities/calculations';
import { getBeautifulStatus, calculateLevelInfo, prepareGamifyMessage } from '../../features/activities/xp';
import { prepareActivityMessage } from '../../features/activities/messages';
import { log, errorLog } from '../../shared/logger';
import { getFullActivityInfo } from '../../infrastructure/strava/service';
import { getBot } from '../../infrastructure/bot/config';

export const webhookHandler = async (req, res) => {
    res.status(200).send('OK');

    try {
        const { object_type, object_id, aspect_type, owner_id, event_time } = req.body;
        log('WEBHOOK', `📨 Received event: ${object_type} / ${aspect_type} | ID: ${object_id} | Owner: ${owner_id}`);

        if (!(object_type === 'activity' && aspect_type === 'create')) {
            log('WEBHOOK', 'Event ignored (not activity creation)');
            return;
        }

        const user = await getUserByAthleteId(owner_id);

        if (!user) {
            errorLog('WEBHOOK', `User with athleteId ${owner_id} not found in DB`, null);
            return;
        }

        log('WEBHOOK', `Processing activity for user: ${user.username} (ID: ${user.id})`);

        if (user.expiresat <= new Date()) await refreshUserToken(user);

        const activity = await getFullActivityInfo({ activityId: object_id, userAccessToken: user.accesstoken });
        log('WEBHOOK', `Activity details fetched. Type: ${activity.type}, Name: ${activity.name}`);

        const { streakMessage, newStreak, xpMultiplier } = getStreakData(user, event_time);
        const { beautifulBonusXp, beautifulBonusMessage } = getBeautifulStatus(activity);

        const { newLevel, earnedXp, nextLevelRequiredXp } = await calculateLevelInfo({
            activity,
            user,
            xpMultiplier,
            beautifulBonusXp,
        });

        const newXp = user.xp + earnedXp;
        log('WEBHOOK', `Finalizing: Earned ${earnedXp} XP. New Total: ${newXp}. New Level: ${newLevel}`);

        const gamifyMessage = prepareGamifyMessage({ user, earnedXp, newLevel, nextLevelRequiredXp, xpMultiplier });
        const activityDetailsMessage = prepareActivityMessage({ activity, user, newLevel });

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

        log('WEBHOOK', `Sending Telegram message to chat ${user.chatid}`);
        const bot = getBot();
        await bot.telegram.sendMessage(user.chatid, message, { parse_mode: 'Markdown' });

        await updateUserStats(user.id, newXp, newLevel, event_time, newStreak);
        log('DB', 'User stats updated successfully.');
    } catch (e) {
        errorLog('WEBHOOK', 'CRITICAL ERROR in webhook handler', e);
    }
};
