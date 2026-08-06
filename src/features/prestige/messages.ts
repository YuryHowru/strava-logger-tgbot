import type { User } from '../activities/types';
import { MAX_LVL, rankSystem } from '../activities/constants';

export function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

export function getPrestigeMark(prestigeLevel: number): string {
    return prestigeLevel > 0 ? `⭐${prestigeLevel}` : '';
}

export function formatRankTitle(level: number, prestigeLevel = 0): string {
    const rankTitle = rankSystem[level] ?? 'Без ранга';
    const prestigeMark = getPrestigeMark(prestigeLevel);
    return [prestigeMark, rankTitle].filter(Boolean).join(' ');
}

export function formatUserName(user: Pick<User, 'username'>): string {
    return escapeMarkdown(user.username.replaceAll('_', ' '));
}

export function formatUserRank(user: Pick<User, 'level' | 'prestige_level'>): string {
    return formatRankTitle(user.level, user.prestige_level);
}

export function prepareMaxLevelPrestigeMessage(): string {
    return ['🏁 Максимальный уровень.', 'Доступен /prestige.'].join('\n');
}

export function preparePrestigeUnavailableMessage({
    user,
    nextLevelRequiredXp,
}: {
    user: User;
    nextLevelRequiredXp: number;
}): string {
    return [
        '⭐ Престиж пока закрыт.',
        `Нужен уровень ${MAX_LVL}. Сейчас: ${formatUserRank(user)} ${user.level}, ${user.xp}/${nextLevelRequiredXp} XP.`,
    ].join('\n');
}

export function preparePrestigePromptMessage(nextPrestigeLevel: number): string {
    return [
        '⭐ *Престиж доступен.*',
        '',
        'Сброс: уровень и XP.',
        'Сохранится: серия, медали, история, квесты.',
        '',
        `Новый знак: *${getPrestigeMark(nextPrestigeLevel)}*.`,
        '',
        'Подтверди:',
        '/prestige CONFIRM',
    ].join('\n');
}

export function preparePrestigeSuccessMessage(user: User): string {
    return [
        '🌟⭐ *Престиж получен* ⭐🌟',
        '',
        `*${formatUserRank(user)} ${formatUserName(user)}*`,
        '',
        `Уровень: *${user.level}*`,
        `XP: *${user.xp}*`,
    ].join('\n');
}

export function prepareKickoffPrestigePrompt(users: User[]): string {
    const lines = users.map((user) => `• *${formatUserName(user)}* — ${formatUserRank(user)}`);

    return ['🏁 *Престиж доступен*', '', 'На максимальном уровне:', ...lines, '', '/prestige — посмотреть условия.'].join('\n');
}
