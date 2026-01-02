export function formatTime(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const paddedHrs = hrs.toString().padStart(2, '0');
    const paddedMins = mins.toString().padStart(2, '0');
    const paddedSecs = secs.toString().padStart(2, '0');

    return `${paddedHrs}:${paddedMins}:${paddedSecs}`;
}

export function calculatePace(movingTime: number, distance: number) {
    if (distance === 0) return 'N/A';

    const paceInSecondsPerKm = movingTime / (distance / 1000);
    const mins = Math.floor(paceInSecondsPerKm / 60);
    const secs = Math.floor(paceInSecondsPerKm % 60);

    const paddedSecs = secs.toString().padStart(2, '0');

    return `${mins}:${paddedSecs}`;
}


