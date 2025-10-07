import axios from "axios";
import Redis from "ioredis";
import { config } from "./config.js";

const JOKE_QUEUE_KEY = "jokes:queue";
const DADJOKE_QUEUE_KEY = "dadjokes:queue";
const LORE_QUEUE_KEY = "lore:queue";
const CACHE_TTL = 2 * 60 * 60; // 2 hours
const BATCH_SIZE = 30;
const LOW_THRESHOLD = 3;

type Joke = {
    setup: string;
    delivery: string;
    category?: string;
    type: "twopart" | "single";
    joke?: string;
};

type DadJoke = {
    joke: string;
    id: string;
};

type Lore = {
    title: string;
    text: string;
    author: string;
    subreddit: string;
    url: string;
    score: number;
    imageUrl?: string;
    hasText: boolean;
};

let redis: Redis | null = null;

function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(config.redis.url);
        redis.on("error", (err) => console.error("[redis]", err));
    }
    return redis;
}

// Fetch regular jokes from JokeAPI
async function fetchJokesFromAPI(count: number): Promise<Joke[]> {
    try {
        const { data } = await axios.get(
            `https://v2.jokeapi.dev/joke/Any?amount=${count}&safe-mode`,
            { timeout: 10000 }
        );

        const jokes = data?.jokes ?? [];
        return jokes.filter((j: Joke) => j?.setup || j?.joke);
    } catch (err) {
        console.error("[joke-api] fetch failed:", err);
        return [];
    }
}

// Fetch dad jokes from icanhazdadjoke API
async function fetchDadJokesFromAPI(count: number): Promise<DadJoke[]> {
    try {
        const jokes: DadJoke[] = [];
        for (let i = 0; i < count; i++) {
            const { data } = await axios.get("https://icanhazdadjoke.com/", {
                headers: { Accept: "application/json" },
                timeout: 5000,
            });
            if (data?.joke) {
                jokes.push({ joke: data.joke, id: data.id });
            }
        }
        return jokes;
    } catch (err) {
        console.error("[dadjoke-api] fetch failed:", err);
        return [];
    }
}

// Helper to extract image URL from Reddit post
function extractImageUrl(post: any): string | undefined {
    // Direct image URL (imgur, reddit media, etc)
    if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
        return post.url;
    }

    // Reddit gallery
    if (post.is_gallery && post.media_metadata) {
        const imageIds = Object.keys(post.media_metadata);
        if (imageIds.length > 0) {
            const firstImageId = imageIds[0]!; // Non-null assertion since we checked length
            const imageData = post.media_metadata[firstImageId];
            if (imageData?.s?.u) {
                return imageData.s.u.replace(/&amp;/g, "&");
            }
        }
    }

    // Preview images
    if (post.preview?.images?.[0]?.source?.url) {
        return post.preview.images[0].source.url.replace(/&amp;/g, "&");
    }

    // Reddit i.redd.it links
    if (post.url && post.url.includes("i.redd.it")) {
        return post.url;
    }

    return undefined;
}

// Fetch lore from Reddit with strong text preference
async function fetchLoreFromReddit(): Promise<Lore[]> {
    try {
        // Text-focused subreddits (prioritize these)
        const textSubs = [
            "tumblr",
            "CuratedTumblr",
            "BrandNewSentence",
            "suspiciouslyspecific",
            "rareinsults",
            "WhitePeopleTwitter",
            "BlackPeopleTwitter",
            "ScottishPeopleTwitter",
        ];

        const allLore: Lore[] = [];

        for (const sub of textSubs) {
            try {
                const { data } = await axios.get(
                    `https://www.reddit.com/r/${sub}/hot.json?limit=50`,
                    {
                        headers: {
                            "User-Agent": "Discord-Bot-Lore-Fetcher/1.0",
                        },
                        timeout: 10000,
                    }
                );

                const posts = data?.data?.children ?? [];

                for (const post of posts) {
                    const p = post.data;

                    // Skip NSFW, removed, deleted, stickied
                    if (
                        p.over_18 ||
                        p.stickied ||
                        p.removed_by_category ||
                        p.author === "[deleted]"
                    ) {
                        continue;
                    }

                    // Check for meaningful text content
                    const hasText = !!(
                        p.selftext && p.selftext.trim().length > 30
                    );

                    // Extract image if exists
                    const imageUrl = extractImageUrl(p);

                    // Must have either substantial text OR an image
                    if (!hasText && !imageUrl) {
                        continue;
                    }

                    // For image posts from text subs, require good title
                    if (!hasText && imageUrl && p.title.length < 20) {
                        continue;
                    }

                    allLore.push({
                        title: p.title,
                        text: p.selftext || "",
                        author: p.author,
                        subreddit: p.subreddit,
                        url: `https://reddit.com${p.permalink}`,
                        score: p.score || 0,
                        imageUrl,
                        hasText,
                    });
                }
            } catch (err) {
                console.error(`[lore] Failed to fetch r/${sub}:`, err);
            }
        }

        // Sort: text posts first (by score), then image posts (by score)
        const textPosts = allLore
            .filter((l) => l.hasText)
            .sort((a, b) => b.score - a.score);
        const imagePosts = allLore
            .filter((l) => !l.hasText && l.imageUrl)
            .sort((a, b) => b.score - a.score);

        // Take 85% text, 15% images to strongly favor text
        const textCount = Math.min(
            textPosts.length,
            Math.ceil(BATCH_SIZE * 0.85)
        );
        const imageCount = Math.min(imagePosts.length, BATCH_SIZE - textCount);

        const result = [
            ...textPosts.slice(0, textCount),
            ...imagePosts.slice(0, imageCount),
        ];

        console.log(
            `[lore] Collected ${result.length} posts (${textCount} text, ${imageCount} image-only)`
        );
        return result;
    } catch (err) {
        console.error("[lore-reddit] fetch failed:", err);
        return [];
    }
}

// Fill regular jokes cache
export async function fillJokesCache(count = BATCH_SIZE): Promise<number> {
    const jokes = await fetchJokesFromAPI(count);
    if (!jokes.length) return 0;

    const r = getRedis();
    const pipeline = r.pipeline();
    jokes.forEach((j) => pipeline.rpush(JOKE_QUEUE_KEY, JSON.stringify(j)));
    pipeline.expire(JOKE_QUEUE_KEY, CACHE_TTL);
    await pipeline.exec();

    console.log(`[joke-cache] Added ${jokes.length} jokes`);
    return jokes.length;
}

// Fill dad jokes cache
export async function fillDadJokesCache(count = BATCH_SIZE): Promise<number> {
    const jokes = await fetchDadJokesFromAPI(count);
    if (!jokes.length) return 0;

    const r = getRedis();
    const pipeline = r.pipeline();
    jokes.forEach((j) => pipeline.rpush(DADJOKE_QUEUE_KEY, JSON.stringify(j)));
    pipeline.expire(DADJOKE_QUEUE_KEY, CACHE_TTL);
    await pipeline.exec();

    console.log(`[dadjoke-cache] Added ${jokes.length} dad jokes`);
    return jokes.length;
}

// Fill lore cache
export async function fillLoreCache(): Promise<number> {
    const lore = await fetchLoreFromReddit();
    if (!lore.length) return 0;

    const r = getRedis();
    const pipeline = r.pipeline();
    lore.forEach((l) => pipeline.rpush(LORE_QUEUE_KEY, JSON.stringify(l)));
    pipeline.expire(LORE_QUEUE_KEY, CACHE_TTL);
    await pipeline.exec();

    const textCount = lore.filter((l) => l.hasText).length;
    const imageCount = lore.length - textCount;
    console.log(
        `[lore-cache] Added ${lore.length} lore (${textCount} text, ${imageCount} images)`
    );
    return lore.length;
}

// Pop a regular joke
export async function popJoke(): Promise<Joke | null> {
    const r = getRedis();
    let raw = await r.lpop(JOKE_QUEUE_KEY);

    if (!raw) {
        console.log("[joke-cache] Empty, refilling...");
        await fillJokesCache();
        raw = await r.lpop(JOKE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await r.llen(JOKE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillJokesCache();

    try {
        return JSON.parse(raw) as Joke;
    } catch {
        return null;
    }
}

// Pop a dad joke
export async function popDadJoke(): Promise<DadJoke | null> {
    const r = getRedis();
    let raw = await r.lpop(DADJOKE_QUEUE_KEY);

    if (!raw) {
        console.log("[dadjoke-cache] Empty, refilling...");
        await fillDadJokesCache();
        raw = await r.lpop(DADJOKE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await r.llen(DADJOKE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillDadJokesCache();

    try {
        return JSON.parse(raw) as DadJoke;
    } catch {
        return null;
    }
}

// Pop a lore post
export async function popLore(): Promise<Lore | null> {
    const r = getRedis();
    let raw = await r.lpop(LORE_QUEUE_KEY);

    if (!raw) {
        console.log("[lore-cache] Empty, refilling...");
        await fillLoreCache();
        raw = await r.lpop(LORE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await r.llen(LORE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillLoreCache();

    try {
        return JSON.parse(raw) as Lore;
    } catch {
        return null;
    }
}

// Initialize all caches on bot startup
export async function initJokeCaches() {
    console.log("[caches] Initializing joke and lore caches...");
    await Promise.all([fillJokesCache(), fillDadJokesCache(), fillLoreCache()]);
}
