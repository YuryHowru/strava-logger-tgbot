import type { MonthlyAward } from './types';

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

function formatMonth(periodKey: string): string {
    const [year, month] = periodKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
    });
}

export function prepareMonthlyAwardsMessage(periodKey: string, awards: MonthlyAward[]): string {
    if (!awards.length) {
        return `🎤 *Итоги месяца: ${formatMonth(periodKey)}*\n\nВ этом месяце не было активностей. Новый месяц — новый шанс.`;
    }

    const lines = awards.map(
        (award) => {
            const rewardLine = award.rewardXp > 0 ? ` (+${award.rewardXp} XP)` : '';
            return `${award.title}: *${escapeMarkdown(award.username.replaceAll('_', ' '))}* — ${escapeMarkdown(award.value)}${rewardLine}`;
        }
    );

    return [`🎤 *Итоги месяца: ${formatMonth(periodKey)}*`, '', ...lines].join('\n');
}
