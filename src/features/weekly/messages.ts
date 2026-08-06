import type { WeeklySummary } from './types';

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

function formatDistance(meters: number): string {
    return `${(meters / 1000).toFixed(1)} км`;
}

function formatDate(dateString: string): string {
    return new Date(`${dateString}T00:00:00.000Z`).toLocaleDateString('ru-RU');
}

function prepareBossSummaryLine(summary: WeeklySummary): string | null {
    if (!summary.bossBattle) {
        return null;
    }

    const bossName = escapeMarkdown(summary.bossBattle.boss_name);

    if (summary.bossBattle.status === 'defeated') {
        return `👹 Босс недели: *${bossName}* повержен.`;
    }

    return `👹 Босс недели: *${bossName}* устоял — ${Math.min(summary.bossBattle.current_damage, summary.bossBattle.hp)} / ${summary.bossBattle.hp} HP.`;
}

export function prepareWeeklySummaryMessage(summary: WeeklySummary): string {
    const leaderboard = summary.standings.length
        ? summary.standings
              .slice(0, 5)
              .map(
                  (user, index) =>
                      `${index + 1}. *${escapeMarkdown(user.username.replaceAll('_', ' '))}* — ${user.total_xp} XP, ${user.activities_count} акт.`
              )
              .join('\n')
        : 'На прошлой неделе никто не тренировался.';
    const randomWinnerLine = summary.randomWinner && summary.randomWinnerGrantedXp > 0
        ? `\n\n🎲 Рандом недели: *${escapeMarkdown(summary.randomWinner.username.replaceAll('_', ' '))}* (+${summary.randomWinnerGrantedXp} XP)`
        : '';
    const bossSummaryLine = prepareBossSummaryLine(summary);

    return [
        `📅 *Итоги недели* ${formatDate(summary.startDate)} — ${formatDate(summary.endDate)}`,
        '',
        `Тренировались: *${summary.activeUsersCount}*`,
        `Всего тренировок: *${summary.totalActivities}*`,
        `XP заработано: *${summary.totalXp}*`,
        `Дистанция: *${formatDistance(summary.totalDistanceM)}*`,
        '',
        '🏆 *Топ недели*',
        leaderboard,
        randomWinnerLine,
        bossSummaryLine ? '\n' + bossSummaryLine : '',
        '',
        '🎯 Новые личные квесты недели выданы. Проверь свои через /quests',
    ]
        .filter((part) => part !== '')
        .join('\n');
}
