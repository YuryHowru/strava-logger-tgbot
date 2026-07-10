import { completeChallenge, countUserChallengeVictories, findLevelInDb, getChallengeStandings, getUserById, insertUserAchievements, updateUserXpAndLevel } from '../../infrastructure/database/service';
import type { Queryable } from '../../infrastructure/database/types';
import { getChallengeBadgeCandidates } from '../achievements/service';
import type { BadgeKey } from '../achievements/types';
import { prepareChallengeFinishedMessage } from './messages';
import type { ChallengeMetric, ChatChallenge, ChallengeStandingRow } from './types';

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
}> {
    const standings = await getChallengeStandings(challenge, db);
    const topStanding = standings[0];
    const hasWinner = Boolean(topStanding && topStanding.metric_value > 0);
    const rewardXp = hasWinner ? 100 : 0;
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
        };
    }

    const winner = await getUserById(topStanding.user_id, db);
    if (!winner) {
        return {
            finalizedChallenge,
            standings,
            announcement: null,
            winnerBadgeKeys: [],
        };
    }

    const newXp = winner.xp + rewardXp;
    const newLevelInfo = await findLevelInDb(newXp, db);
    await updateUserXpAndLevel(winner.id, newXp, newLevelInfo.level, db);

    const victoriesCount = await countUserChallengeVictories(winner.id, db);
    const challengeBadgeCandidates = getChallengeBadgeCandidates(victoriesCount);
    const insertedBadgeKeys = await insertUserAchievements(winner.id, challengeBadgeCandidates, db);

    return {
        finalizedChallenge,
        standings,
        announcement: prepareChallengeFinishedMessage({
            challenge: finalizedChallenge,
            standings,
            winnerUsername: winner.username,
            rewardXp,
            newBadgeKeys: insertedBadgeKeys,
        }),
        winnerBadgeKeys: insertedBadgeKeys,
    };
}
