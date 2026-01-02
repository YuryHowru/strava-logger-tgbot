export const log = (tag: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [${tag}] ${message}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${timestamp}] [${tag}] ${message}`);
    }
};

export const errorLog = (tag: string, message: string, error: any) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${tag}] ❌ ERROR: ${message}`, error);
};

