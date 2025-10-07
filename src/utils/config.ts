import "dotenv/config";

function getEnv(key: string, fallback?: string): string {
    const value = process.env[key]?.trim();
    if (!value && !fallback) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value || fallback!;
}

export const config = {
    discord: {
        token: getEnv("TOKEN"),
        applicationId: getEnv("APPLICATION_ID"),
        guildId: getEnv("GUILD_ID", ""), // optional for dev
    },
    redis: {
        url: getEnv("REDIS_URL", "redis://localhost:6379"),
    },
} as const;
