import type { BadgeDefinition, BadgeKey } from './types';

export const badgeDefinitions: BadgeDefinition[] = [
    { key: 'first_activity', title: 'Первый Пот', description: 'Первая засчитанная тренировка.' },
    { key: 'streak_3', title: 'На Серии', description: 'Три дня подряд без слива.' },
    { key: 'streak_7', title: 'Неделя Боли', description: 'Семь дней подряд в движении.' },
    { key: 'level_5', title: 'Разогрелся', description: 'Добрался до 5 уровня.' },
    { key: 'level_10', title: 'Двузначный', description: 'Добрался до 10 уровня.' },
    { key: 'run_10k', title: 'Десятка', description: 'Пробежал 10 км или больше.' },
    { key: 'ride_50k', title: 'Полтос На Колёсах', description: 'Проехал 50 км или больше.' },
    { key: 'double_day', title: 'Двойная Смена', description: 'Сделал две тренировки в один день.' },
    { key: 'sniper_distance', title: 'Снайпер', description: 'Закрыл идеально ровную дистанцию.' },
    { key: 'iron_hour', title: 'Железный Час', description: 'Час силовой без капитуляции.' },
    { key: 'calorie_furnace', title: 'Печь', description: 'Сжёг 500+ ккал на силовой.' },
    { key: 'double_pump', title: 'Двойной Памп', description: 'Две силовые за один день.' },
    { key: 'sunrise_hunter', title: 'Охотник За Рассветом', description: 'Стартовал раньше 06:00.' },
    { key: 'night_shift', title: 'Ночная Смена', description: 'Тренировка началась после 22:00.' },
    { key: 'challenge_champion', title: 'Чемпион Челленджа', description: 'Первая победа в чат-челлендже.' },
    { key: 'triple_crown', title: 'Тройная Корона', description: 'Три победы в чат-челленджах.' },
    { key: 'comeback_7', title: 'Камбэк', description: 'Вернулся после 7+ дней паузы.' },
    { key: 'comeback_14', title: 'Большой Камбэк', description: 'Вернулся после 14+ дней паузы.' },
    { key: 'comeback_30', title: 'Из Спячки', description: 'Вернулся после 30+ дней паузы.' },
];

export const badgeDefinitionMap: Record<BadgeKey, BadgeDefinition> = badgeDefinitions.reduce(
    (acc, badge) => {
        acc[badge.key] = badge;
        return acc;
    },
    {} as Record<BadgeKey, BadgeDefinition>
);
