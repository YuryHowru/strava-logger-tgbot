import {
    completeChallenge,
    countUserChallengeVictories,
    createChallengeWinnerBadge,
    findLevelInDb,
    getChallengeStandings,
    getUserById,
    insertUserAchievements,
    updateUserXpAndLevel,
} from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import { getChallengeBadgeCandidates } from '../achievements/service';
import type { BadgeKey } from '../achievements/types';
import { MAX_LVL } from '../activities/constants';
import { prepareChallengeFinishedMessage } from './messages';
import type { ChallengeMetric, ChatChallenge, ChallengeStandingRow } from './types';

const CHALLENGE_WINNER_REWARD_XP = 1000;

function capRewardXp(currentXp: number, rewardXp: number, maxRequiredXp: number): number {
    return Math.max(0, Math.min(rewardXp, maxRequiredXp - currentXp));
}

export function parseChallengeMetric(rawMetric: string): ChallengeMetric | null {
    if (rawMetric === 'xp') return 'xp';
    if (rawMetric === 'distance') return 'distance';
    if (rawMetric === 'activities') return 'activity_count';
    return null;
}

export function isChallengeExpired(challenge: ChatChallenge, now: Date = new Date()): boolean {
    return challenge.ends_at <= now;
}

export async function finalizeChallenge({
    challenge,
    status,
    db,
}: {
    challenge: ChatChallenge;
    status: 'finished' | 'stopped';
    db: Queryable;
}): Promise<{
    finalizedChallenge: ChatChallenge | null;
    standings: ChallengeStandingRow[];
    announcement: string | null;
    winnerBadgeKeys: BadgeKey[];
    winnerChallengeBadgeTitle: string | null;
}> {
    const standings = await getChallengeStandings(challenge, db);
    const topStanding = standings[0];
    const hasWinner = Boolean(topStanding && topStanding.metric_value > 0);
    const winner = hasWinner ? await getUserById(topStanding.user_id, db) : null;
    const winnerLevelInfo = winner && winner.level < MAX_LVL ? await findLevelInDb(winner.xp + CHALLENGE_WINNER_REWARD_XP, db) : null;
    const rewardXp = winnerLevelInfo ? capRewardXp(winner!.xp, CHALLENGE_WINNER_REWARD_XP, winnerLevelInfo.total_required_xp) : 0;
    const finalizedChallenge = await completeChallenge(
        {
            challengeId: challenge.id,
            status,
            winnerUserId: hasWinner ? topStanding.user_id : null,
            winnerRewardXp: rewardXp,
            finishedAt: new Date(),
        },
        db
    );

    if (!finalizedChallenge) {
        return {
            finalizedChallenge: null,
            standings,
            announcement: null,
            winnerBadgeKeys: [],
            winnerChallengeBadgeTitle: null,
        };
    }

    if (!hasWinner) {
        return {
            finalizedChallenge,
            standings,
            announcement: prepareChallengeFinishedMessage({
                challenge: finalizedChallenge,
                standings,
                winnerUsername: null,
                rewardXp: 0,
                newBadgeKeys: [],
            }),
            winnerBadgeKeys: [],
            winnerChallengeBadgeTitle: null,
        };
    }

    if (!winner) {
        return {
            finalizedChallenge,
            standings,
            announcement: null,
            winnerBadgeKeys: [],
            winnerChallengeBadgeTitle: null,
        };
    }

    if (rewardXp > 0) {
        const newXp = winner.xp + rewardXp;
        const newLevelInfo = await findLevelInDb(newXp, db);
        await updateUserXpAndLevel(winner.id, newXp, newLevelInfo.level, db);
    }

    const victoriesCount = await countUserChallengeVictories(winner.id, db);
    const challengeBadgeCandidates = getChallengeBadgeCandidates(victoriesCount);
    const insertedBadgeKeys = await insertUserAchievements(winner.id, challengeBadgeCandidates, db);
    const winnerChallengeBadge = await createChallengeWinnerBadge(winner.id, finalizedChallenge.id, finalizedChallenge.title, db);

    return {
        finalizedChallenge,
        standings,
        announcement: prepareChallengeFinishedMessage({
            challenge: finalizedChallenge,
            standings,
            winnerUsername: winner.username,
            rewardXp,
            newBadgeKeys: insertedBadgeKeys,
            newChallengeBadgeTitle: winnerChallengeBadge?.challenge_title ?? null,
        }),
        winnerBadgeKeys: insertedBadgeKeys,
        winnerChallengeBadgeTitle: winnerChallengeBadge?.challenge_title ?? null,
    };
}
