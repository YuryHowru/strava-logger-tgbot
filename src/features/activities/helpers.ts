type StravaActivityLike = {
    type?: string;
    sport_type?: string;
    start_date?: string | Date;
    start_date_local?: string | Date;
};

function stringifyDate(value: string | Date | undefined): string {
    if (!value) return new Date().toISOString();
    return typeof value === 'string' ? value : value.toISOString();
}

export function getActivityType(activity: StravaActivityLike): string {
    return activity.type ?? activity.sport_type ?? 'default';
}

export function getActivityStartUtc(activity: StravaActivityLike): Date {
    return new Date(stringifyDate(activity.start_date));
}

export function getActivityStartLocal(activity: StravaActivityLike): Date {
    return new Date(stringifyDate(activity.start_date_local));
}

export function getActivityLocalDate(activity: StravaActivityLike): string {
    const raw = activity.start_date_local;
    if (typeof raw === 'string') {
        return raw.slice(0, 10);
    }

    return stringifyDate(raw).slice(0, 10);
}

export function getActivityLocalHour(activity: StravaActivityLike): number {
    const raw = activity.start_date_local;
    if (typeof raw === 'string') {
        return Number.parseInt(raw.slice(11, 13), 10);
    }

    return getActivityStartLocal(activity).getUTCHours();
}
