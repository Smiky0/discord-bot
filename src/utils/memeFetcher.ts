import axios from "axios";
import Redis from "ioredis";
import { EmbedBuilder, type Client } from "discord.js";
import { config } from "../utils/config";

const MEME_API = "https://meme-api.com/gimme/memes";
const QUEUE_KEY = "memes:queue";
const AUTO_GUILDS = "memes:auto:guilds";
const AUTO_CFG = (gid: string) => `memes:auto:cfg:${gid}`;

const CACHE_TTL = 2 * 60 * 60; // 2 hours
const BATCH_SIZE = 50;
const LOW_THRESHOLD = 5;

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

function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(config.redis.url);
        redis.on("error", (err) => console.error("[redis]", err));
    }
    return redis;
}

async function fetchFromAPI(count: number): Promise<Meme[]> {
    try {
        const { data } = await axios.get(`${MEME_API}/${count}`, {
            timeout: 10000,
        });
        // Keep both SFW and NSFW, just filter broken entries
        return (data?.memes ?? []).filter((m: Meme) => m?.url && m?.title);
    } catch (err) {
        console.error("[meme-api] fetch failed:", err);
        return [];
    }
}

export async function fillCache(count = BATCH_SIZE): Promise<number> {
    const memes = await fetchFromAPI(count);
    if (!memes.length) return 0;

    const r = getRedis();
    const pipeline = r.pipeline();
    memes.forEach((m) => pipeline.rpush(QUEUE_KEY, JSON.stringify(m)));
    pipeline.expire(QUEUE_KEY, CACHE_TTL);
    await pipeline.exec();

    console.log(`[meme-cache] Added ${memes.length} memes`);
    return memes.length;
}

export async function popMeme(): Promise<Meme | null> {
    const r = getRedis();
    let raw = await r.lpop(QUEUE_KEY);

    if (!raw) {
        console.log("[meme-cache] Empty, refilling...");
        await fillCache();
        raw = await r.lpop(QUEUE_KEY);
    }

    if (!raw) return null;

    // Background refill when low
    const remaining = await r.llen(QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillCache();

    try {
        return JSON.parse(raw) as Meme;
    } catch {
        return null;
    }
}

function createEmbed(meme: Meme) {
    const isNsfw = meme.nsfw || meme.spoiler;

    const embed = new EmbedBuilder()
        .setURL(meme.postLink || meme.url)
        .setFooter({
            text: `r/${meme.subreddit}${
                meme.author ? ` • u/${meme.author}` : ""
            }${meme.ups ? ` • 👍 ${meme.ups}` : ""}${
                isNsfw ? " • 🔞 NSFW" : ""
            }`,
        });

    // For NSFW memes, mark image as spoiler and add warning to title
    if (isNsfw) {
        embed.setTitle(`🔞 ${meme.title}`);
        // Discord auto-spoilers images in NSFW-marked embeds when you use ||url||
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
        const channel = await client.channels.fetch(channelId);
        if (!channel || !("send" in channel)) return false;

        const meme = await popMeme();
        if (!meme) return false;

        await (channel as any).send({ embeds: [createEmbed(meme)] });
        return true;
    } catch (err) {
        console.error(`[meme] Send failed (${channelId}):`, err);
        return false;
    }
}

export async function setAutoMeme(
    guildId: string,
    channelId: string,
    intervalMin = 120
) {
    const cfg: AutoConfig = {
        channelId,
        intervalMs: Math.max(5, intervalMin) * 60_000,
        nextAt: Date.now() + 60_000, // first in 1 min
    };
    const r = getRedis();
    await r.sadd(AUTO_GUILDS, guildId);
    await r.set(AUTO_CFG(guildId), JSON.stringify(cfg));
    console.log(`[meme-auto] Enabled for guild ${guildId}`);
}

export async function disableAutoMeme(guildId: string) {
    const r = getRedis();
    await r.srem(AUTO_GUILDS, guildId);
    await r.del(AUTO_CFG(guildId));
    console.log(`[meme-auto] Disabled for guild ${guildId}`);
}

export async function getAutoConfig(
    guildId: string
): Promise<AutoConfig | null> {
    const r = getRedis();
    const raw = await r.get(AUTO_CFG(guildId));
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function startScheduler(client: Client) {
    const r = getRedis();

    void fillCache(); // warm cache

    const tick = async () => {
        try {
            const guilds = await r.smembers(AUTO_GUILDS);
            const now = Date.now();

            for (const gid of guilds) {
                const raw = await r.get(AUTO_CFG(gid));
                if (!raw) {
                    await r.srem(AUTO_GUILDS, gid);
                    continue;
                }

                const cfg: AutoConfig = JSON.parse(raw);
                if (now < cfg.nextAt) continue;

                const ok = await sendMeme(client, cfg.channelId);
                cfg.nextAt = now + (ok ? cfg.intervalMs : 5 * 60_000); // retry in 5min on fail
                await r.set(AUTO_CFG(gid), JSON.stringify(cfg));
            }
        } catch (err) {
            console.error("[scheduler] tick error:", err);
        }
    };

    setInterval(tick, 60_000);
    setTimeout(tick, 5_000);
    console.log("[scheduler] Started (60s interval)");
}
