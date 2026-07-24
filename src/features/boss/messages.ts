import type { BossBattle, BossContributor } from './types';

function escapeMarkdown(text: string): string {
    return text.replace(/([_*[\]`])/g, '\\$1');
}

function getHpLine(battle: BossBattle): string {
    return `${Math.min(battle.current_damage, battle.hp)} / ${battle.hp} HP`;
}

export function prepareBossProgressMessage(battle: BossBattle, damage: number): string {
    return `👹 Босс недели: *${escapeMarkdown(battle.boss_name)}* — ${getHpLine(battle)} (+${damage} урона)`;
}

export function prepareBossDefeatedMessage(battle: BossBattle, rewardedUsersCount: number, rewardXp: number): string {
    return `\n👹 *${escapeMarkdown(battle.boss_name)} повержен!*\nУчастники недели получили +${rewardXp} XP. Награждено: ${rewardedUsersCount}.`;
}

export function prepareBossStatusMessage(battle: BossBattle | null, contributors: BossContributor[]): string {
    if (!battle) {
        return '👹 Босс недели пока не создан. Он появится автоматически в начале недельного цикла.';
    }

    const contributorsLine = contributors.length
        ? contributors
              .slice(0, 5)
              .map((contributor, index) => `${index + 1}. *${escapeMarkdown(contributor.username.replaceAll('_', ' '))}* — ${contributor.damage}`)
              .join('\n')
        : 'Пока никто не нанёс урон.';

    return [
        `👹 *${escapeMarkdown(battle.boss_name)}*`,
        '',
        `Статус: *${battle.status}*`,
        `HP: *${getHpLine(battle)}*`,
        '',
        '⚔️ *Топ урона*',
        contributorsLine,
    ].join('\n');
}
