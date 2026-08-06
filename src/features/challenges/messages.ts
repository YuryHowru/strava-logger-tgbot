import type { BadgeKey } from '../achievements/types';
import { badgeDefinitionMap } from '../achievements/catalog';
import type { ChallengeMetric, ChallengeStandingRow, ChatChallenge } from './types';

const metricLabels: Record<ChallengeMetric, string> = {
    xp: 'XP',
    distance: 'дистанция',
    activity_count: 'тренировки',
};

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

export function getChallengeMetricLabel(metric: ChallengeMetric): string {
    return metricLabels[metric];
}

export function formatChallengeMetricValue(metric: ChallengeMetric, value: number): string {
    if (metric === 'distance') {
        return `${(value / 1000).toFixed(2)} км`;
    }

    if (metric === 'activity_count') {
        return `${value} шт`;
    }

    return `${value} XP`;
}

export function prepareChallengeStartedMessage(challenge: ChatChallenge): string {
    return `🏁 *${escapeMarkdown(challenge.title)}*\n\nМетрика: *${getChallengeMetricLabel(challenge.metric)}*\nДлительность: *${challenge.duration_days} дн.*\nФиниш: *${challenge.ends_at.toLocaleString('ru-RU')}*\n\nВступай через \`/challenge_join\``;
}

export function prepareChallengeProgressMessage(
    challenge: ChatChallenge,
    standings: ChallengeStandingRow[],
    userId: number
): string {
    const currentIndex = standings.findIndex((standing) => standing.user_id === userId);
    if (currentIndex === -1) {
        return '';
    }

    const current = standings[currentIndex];
    return `\n🏁 *${escapeMarkdown(challenge.title)}*: ${formatChallengeMetricValue(challenge.metric, current.metric_value)} • место *${currentIndex + 1}/${standings.length}*`;
}

export function prepareChallengeStatusMessage(
    challenge: ChatChallenge,
    standings: ChallengeStandingRow[],
    participants: Array<{ username: string; joined_at: Date }>,
    currentUserId?: number
): string {
    const participantsLine = participants.length
        ? participants.map((participant) => participant.username.replaceAll('_', ' ')).join(', ')
        : 'пока никого';
    const leaderboard = standings.length
        ? standings
              .slice(0, 10)
              .map(
                  (standing, index) =>
                      `${index + 1}. *${escapeMarkdown(standing.username.replaceAll('_', ' '))}* — ${formatChallengeMetricValue(
                          challenge.metric,
                          standing.metric_value
                      )}`
              )
              .join('\n')
        : 'Пока тишина.';

    const currentUserIndex = currentUserId ? standings.findIndex((standing) => standing.user_id === currentUserId) : -1;
    const currentUserLine =
        currentUserIndex >= 0
            ? `\n\nТвоя позиция: *${currentUserIndex + 1}* — ${formatChallengeMetricValue(
                  challenge.metric,
                  standings[currentUserIndex].metric_value
              )}`
            : '';

    return `🏁 *${escapeMarkdown(challenge.title)}*\n\nМетрика: *${getChallengeMetricLabel(challenge.metric)}*\nФиниш: *${challenge.ends_at.toLocaleString(
        'ru-RU'
    )}*\nУчастники: ${escapeMarkdown(participantsLine)}\n\n${leaderboard}${currentUserLine}`;
}

export function prepareChallengeFinishedMessage({
    challenge,
    standings,
    winnerUsername,
    rewardXp,
    newBadgeKeys,
    newChallengeBadgeTitle,
}: {
    challenge: ChatChallenge;
    standings: ChallengeStandingRow[];
    winnerUsername: string | null;
    rewardXp: number;
    newBadgeKeys: BadgeKey[];
    newChallengeBadgeTitle?: string | null;
}): string {
    const leaderboard = standings.length
        ? standings
              .slice(0, 10)
              .map(
                  (standing, index) =>
                      `${index + 1}. *${escapeMarkdown(standing.username.replaceAll('_', ' '))}* — ${formatChallengeMetricValue(
                          challenge.metric,
                          standing.metric_value
                      )}`
              )
              .join('\n')
        : 'Никто даже не вспотел.';

    if (!winnerUsername) {
        return `🏁 *${escapeMarkdown(challenge.title)} завершён*\n\nМетрика: *${getChallengeMetricLabel(
            challenge.metric
        )}*\nПобедителя нет.\n\n${leaderboard}`;
    }

    const badgeLine = newBadgeKeys.length
        ? `\nНовые медали: ${newBadgeKeys.map((badgeKey) => `*${badgeDefinitionMap[badgeKey].title}*`).join(', ')}`
        : '';
    const challengeBadgeLine = newChallengeBadgeTitle
        ? `\nНовая медаль: *Победитель челленджа: ${escapeMarkdown(newChallengeBadgeTitle)}*`
        : '';
    const rewardLine = rewardXp > 0 ? `\nНаграда: *+${rewardXp} XP*` : '';

    return `🏁 *${escapeMarkdown(challenge.title)} завершён*\n\nПобедитель: *${escapeMarkdown(winnerUsername.replaceAll(
        '_',
        ' '
    ))}*${rewardLine}${challengeBadgeLine}${badgeLine}\n\n${leaderboard}`;
}
