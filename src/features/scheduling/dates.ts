const DEFAULT_TIME_ZONE = 'Europe/Riga';

type LocalDatePeriod = {
    key: string;
    startDate: string;
    endDate: string;
};

type ZonedDateParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: string;
};

function getReportTimeZone(): string {
    return process.env.REPORT_TIME_ZONE || DEFAULT_TIME_ZONE;
}

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

function getDateString(date: Date): string {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseDateString(dateString: string): Date {
    return new Date(`${dateString}T00:00:00.000Z`);
}

function addDays(dateString: string, days: number): string {
    const date = parseDateString(dateString);
    date.setUTCDate(date.getUTCDate() + days);
    return getDateString(date);
}

function getZonedDateParts(date: Date, timeZone = getReportTimeZone()): ZonedDateParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';

    return {
        year: Number(value('year')),
        month: Number(value('month')),
        day: Number(value('day')),
        hour: Number(value('hour')),
        minute: Number(value('minute')),
        weekday: value('weekday'),
    };
}

function getWeekdayIndex(weekday: string): number {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

function getLocalDateString(date: Date): string {
    const parts = getZonedDateParts(date);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getWeekStartDate(localDateString: string, weekday: string): string {
    const weekdayIndex = getWeekdayIndex(weekday);
    const daysSinceMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
    return addDays(localDateString, -daysSinceMonday);
}

function getIsoWeekKey(weekStartDate: string): string {
    const date = parseDateString(weekStartDate);
    date.setUTCDate(date.getUTCDate() + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const diffDays = Math.round((date.getTime() - firstThursday.getTime()) / 86400000);
    const week = 1 + Math.floor((diffDays + ((firstThursday.getUTCDay() + 6) % 7)) / 7);

    return `${date.getUTCFullYear()}-W${pad(week)}`;
}

export function getCurrentWeekPeriod(now = new Date()): LocalDatePeriod {
    const localDate = getLocalDateString(now);
    const weekStart = getWeekStartDate(localDate, getZonedDateParts(now).weekday);

    return {
        key: getIsoWeekKey(weekStart),
        startDate: weekStart,
        endDate: addDays(weekStart, 7),
    };
}

export function getPreviousWeekPeriod(now = new Date()): LocalDatePeriod {
    const currentWeek = getCurrentWeekPeriod(now);
    const startDate = addDays(currentWeek.startDate, -7);

    return {
        key: getIsoWeekKey(startDate),
        startDate,
        endDate: currentWeek.startDate,
    };
}

export function getPreviousMonthPeriod(now = new Date()): LocalDatePeriod {
    const parts = getZonedDateParts(now);
    const currentMonthStart = `${parts.year}-${pad(parts.month)}-01`;
    const previousMonthEnd = parseDateString(currentMonthStart);
    previousMonthEnd.setUTCDate(0);
    const startDate = `${previousMonthEnd.getUTCFullYear()}-${pad(previousMonthEnd.getUTCMonth() + 1)}-01`;

    return {
        key: `${previousMonthEnd.getUTCFullYear()}-${pad(previousMonthEnd.getUTCMonth() + 1)}`,
        startDate,
        endDate: currentMonthStart,
    };
}

export function isWeeklyReportDue(now = new Date()): boolean {
    const parts = getZonedDateParts(now);
    return parts.weekday === 'Mon' && parts.hour === 9 && parts.minute < 15;
}

export function isMonthlyReportDue(now = new Date()): boolean {
    const parts = getZonedDateParts(now);
    return parts.day === 1 && parts.hour === 9 && parts.minute < 15;
}
