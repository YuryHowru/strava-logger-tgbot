export function prepareComebackStartedMessage(inactivityDays: number): string {
    return `\n🔁 Камбэк: первая тренировка после *${inactivityDays} дн.* паузы. Сделай ещё одну за 3 дня и забери +200 XP.`;
}

export function prepareComebackCompletedMessage(rewardXp: number): string {
    return `\n🔁 Камбэк-миссия закрыта: ещё одна тренировка после паузы (+${rewardXp} XP).`;
}
