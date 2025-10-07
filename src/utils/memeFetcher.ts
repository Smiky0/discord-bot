import axios from "axios";
import Redis from "ioredis";
import { EmbedBuilder, type Client } from "discord.js";
import { config } from "./config.js";

const MEME_API = "https://meme-api.com/gimme/memes";
const QUEUE_KEY = "memes:queue";
const AUTO_GUILDS = "memes:auto:guilds";
const AUTO_CFG = (gid: string) => `memes:auto:cfg:${gid}`;

const CACHE_TTL = 2 * 60 * 60; // 2 hours
const BATCH_SIZE = 50;
const LOW_THRESHOLD = 5;
const MAX_RETRIES = 3;

type Meme = {
    postLink: string;
    subreddit: string;
    title: string;
    url: string;
    author?: string;
    ups?: number;
    nsfw?: boolean;
    spoiler?: boolean;
};

type AutoConfig = {
    channelId: string;
    intervalMs: number;
    nextAt: number;
};

let redis: Redis | null = null;
let isRedisConnected = false;

function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(config.redis.url, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy: (times) => {
                if (times > 10) {
                    console.error("[redis] Max retry attempts reached");
                    return null;
                }
                return Math.min(times * 100, 3000);
            },
        });

        redis.on("connect", () => {
            isRedisConnected = true;
            console.log("✅ Redis connected");
        });

        redis.on("error", (err) => {
            isRedisConnected = false;
            console.error("[redis] Error:", err.message);
        });

        redis.on("close", () => {
            isRedisConnected = false;
            console.warn("[redis] Connection closed");
        });
    }
    return redis;
}

async function fetchFromAPI(count: number, retries = 0): Promise<Meme[]> {
    try {
        const { data } = await axios.get(`${MEME_API}/${count}`, {
            timeout: 10000,
            validateStatus: (status) => status === 200,
        });

        if (!data?.memes || !Array.isArray(data.memes)) {
            throw new Error("Invalid API response format");
        }

        return data.memes.filter((m: Meme) => m?.url && m?.title);
    } catch (err: any) {
        if (retries < MAX_RETRIES) {
            console.warn(
                `[meme-api] Fetch failed, retry ${retries + 1}/${MAX_RETRIES}`
            );
            await new Promise((resolve) =>
                setTimeout(resolve, 1000 * (retries + 1))
            );
            return fetchFromAPI(count, retries + 1);
        }
        console.error("[meme-api] fetch failed after retries:", err.message);
        return [];
    }
}

export async function fillCache(count = BATCH_SIZE): Promise<number> {
    if (!isRedisConnected) {
        console.warn("[meme-cache] Redis not connected, skipping cache fill");
        return 0;
    }

    try {
        const memes = await fetchFromAPI(count);
        if (!memes.length) return 0;

        const r = getRedis();
        const pipeline = r.pipeline();
        memes.forEach((m) => pipeline.rpush(QUEUE_KEY, JSON.stringify(m)));
        pipeline.expire(QUEUE_KEY, CACHE_TTL);
        await pipeline.exec();

        console.log(`[meme-cache] Added ${memes.length} memes`);
        return memes.length;
    } catch (err: any) {
        console.error("[meme-cache] Fill failed:", err.message);
        return 0;
    }
}

export async function popMeme(): Promise<Meme | null> {
    if (!isRedisConnected) {
        console.warn("[meme-cache] Redis not connected");
        return null;
    }

    try {
        const r = getRedis();
        let raw = await r.lpop(QUEUE_KEY);

        if (!raw) {
            console.log("[meme-cache] Empty, refilling...");
            const filled = await fillCache();
            if (filled === 0) return null;
            raw = await r.lpop(QUEUE_KEY);
        }

        if (!raw) return null;

        // Background refill when low
        const remaining = await r.llen(QUEUE_KEY);
        if (remaining < LOW_THRESHOLD) {
            void fillCache().catch((err) =>
                console.error("[meme-cache] Background refill failed:", err)
            );
        }

        return JSON.parse(raw) as Meme;
    } catch (err: any) {
        console.error("[meme-cache] Pop failed:", err.message);
        return null;
    }
}

function createEmbed(meme: Meme) {
    const isNsfw = meme.nsfw || meme.spoiler;

    const embed = new EmbedBuilder()
        .setURL(meme.postLink || meme.url)
        .setColor("#FF4500")
        .setFooter({
            text: `r/${meme.subreddit}${
                meme.author ? ` • u/${meme.author}` : ""
            }${meme.ups ? ` • 👍 ${meme.ups}` : ""}${
                isNsfw ? " • 🔞 NSFW" : ""
            }`,
        });

    if (isNsfw) {
        embed.setTitle(`🔞 ${meme.title}`);
        embed.setImage(`||${meme.url}||`);
    } else {
        embed.setTitle(meme.title);
        embed.setImage(meme.url);
    }

    return embed;
}

export async function sendMeme(
    client: Client,
    channelId: string
): Promise<boolean> {
    try {
        const channel = await client.channels
            .fetch(channelId)
            .catch(() => null);

        if (!channel) {
            console.warn(
                `[meme] Channel ${channelId} not found or inaccessible`
            );
            return false;
        }

        if (!("send" in channel)) {
            console.warn(`[meme] Channel ${channelId} doesn't support sending`);
            return false;
        }

        const meme = await popMeme();
        if (!meme) {
            console.warn("[meme] No meme available");
            return false;
        }

        await (channel as any).send({ embeds: [createEmbed(meme)] });
        return true;
    } catch (err: any) {
        console.error(`[meme] Send failed (${channelId}):`, err.message);
        return false;
    }
}

export async function setAutoMeme(
    guildId: string,
    channelId: string,
    intervalMin = 120
) {
    if (!isRedisConnected) {
        throw new Error("Redis connection unavailable");
    }

    try {
        const cfg: AutoConfig = {
            channelId,
            intervalMs: Math.max(5, Math.min(1440, intervalMin)) * 60_000,
            nextAt: Date.now() + 60_000,
        };

        const r = getRedis();
        await r.sadd(AUTO_GUILDS, guildId);
        await r.set(AUTO_CFG(guildId), JSON.stringify(cfg));
        console.log(`[meme-auto] Enabled for guild ${guildId}`);
    } catch (err: any) {
        console.error("[meme-auto] Set failed:", err.message);
        throw err;
    }
}

export async function disableAutoMeme(guildId: string) {
    if (!isRedisConnected) {
        throw new Error("Redis connection unavailable");
    }

    try {
        const r = getRedis();
        await r.srem(AUTO_GUILDS, guildId);
        await r.del(AUTO_CFG(guildId));
        console.log(`[meme-auto] Disabled for guild ${guildId}`);
    } catch (err: any) {
        console.error("[meme-auto] Disable failed:", err.message);
        throw err;
    }
}

export async function getAutoConfig(
    guildId: string
): Promise<AutoConfig | null> {
    if (!isRedisConnected) return null;

    try {
        const r = getRedis();
        const raw = await r.get(AUTO_CFG(guildId));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err: any) {
        console.error("[meme-auto] Get config failed:", err.message);
        return null;
    }
}

export function startScheduler(client: Client) {
    const r = getRedis();

    // Warm cache on boot (non-blocking)
    void fillCache().catch((err) =>
        console.error("[scheduler] Initial fill failed:", err)
    );

    const tick = async () => {
        if (!isRedisConnected) {
            console.warn("[scheduler] Skipping tick, Redis disconnected");
            return;
        }

        try {
            const guilds = await r.smembers(AUTO_GUILDS);
            const now = Date.now();

            for (const gid of guilds) {
                try {
                    const raw = await r.get(AUTO_CFG(gid));
                    if (!raw) {
                        await r.srem(AUTO_GUILDS, gid);
                        continue;
                    }

                    const cfg: AutoConfig = JSON.parse(raw);
                    if (now < cfg.nextAt) continue;

                    const ok = await sendMeme(client, cfg.channelId);
                    cfg.nextAt = now + (ok ? cfg.intervalMs : 5 * 60_000);
                    await r.set(AUTO_CFG(gid), JSON.stringify(cfg));
                } catch (err: any) {
                    console.error(
                        `[scheduler] Error processing guild ${gid}:`,
                        err.message
                    );
                }
            }
        } catch (err: any) {
            console.error("[scheduler] Tick error:", err.message);
        }
    };

    setInterval(tick, 60_000);
    setTimeout(tick, 5_000);
    console.log("[scheduler] Started (60s interval)");
}
