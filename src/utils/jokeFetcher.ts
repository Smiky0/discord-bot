import axios from "axios";
import { redis } from "./redisClient.js";

const JOKE_QUEUE_KEY = "jokes:queue";
const DADJOKE_QUEUE_KEY = "dadjokes:queue";
const LORE_QUEUE_KEY = "lore:queue";
const CACHE_TTL = 2 * 60 * 60; // 2 hours
const BATCH_SIZE = 30;
const LOW_THRESHOLD = 3;
const MAX_RETRIES = 3;

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

/** Fetch regular jokes from JokeAPI */
async function fetchJokesFromAPI(count: number, retries = 0): Promise<Joke[]> {
    try {
        const { data } = await axios.get(
            `https://v2.jokeapi.dev/joke/Any?amount=${count}&safe-mode`,
            {
                timeout: 10000,
                validateStatus: (status) => status === 200,
            }
        );

        if (!data?.jokes || !Array.isArray(data.jokes)) {
            throw new Error("Invalid API response");
        }

        return data.jokes.filter((j: Joke) => j?.setup || j?.joke);
    } catch (err: any) {
        if (retries < MAX_RETRIES) {
            console.warn(`[joke-api] Retry ${retries + 1}/${MAX_RETRIES}`);
            await new Promise((r) => setTimeout(r, 1000 * (retries + 1)));
            return fetchJokesFromAPI(count, retries + 1);
        }
        console.error("[joke-api] Failed after retries:", err.message);
        return [];
    }
}

/** Fetch dad jokes from icanhazdadjoke */
async function fetchDadJokesFromAPI(
    count: number,
    retries = 0
): Promise<DadJoke[]> {
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
    } catch (err: any) {
        if (retries < MAX_RETRIES) {
            console.warn(`[dadjoke-api] Retry ${retries + 1}/${MAX_RETRIES}`);
            await new Promise((r) => setTimeout(r, 1000 * (retries + 1)));
            return fetchDadJokesFromAPI(count, retries + 1);
        }
        console.error("[dadjoke-api] fetch failed:", err);
        return [];
    }
}

/** Extract image URL from Reddit post */
function extractImageUrl(post: any): string | undefined {
    if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url))
        return post.url;

    if (post.is_gallery && post.media_metadata) {
        const firstKey = Object.keys(post.media_metadata)[0]!;
        const img = post.media_metadata[firstKey];
        if (img?.s?.u) return img.s.u.replace(/&amp;/g, "&");
    }

    if (post.preview?.images?.[0]?.source?.url)
        return post.preview.images[0].source.url.replace(/&amp;/g, "&");

    if (post.url && post.url.includes("i.redd.it")) return post.url;

    return undefined;
}

/** Fetch lore (text-focused Reddit posts) */
async function fetchLoreFromReddit(): Promise<Lore[]> {
    try {
        const subs = [
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

        for (const sub of subs) {
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
                    if (
                        p.over_18 ||
                        p.stickied ||
                        p.removed_by_category ||
                        p.author === "[deleted]"
                    )
                        continue;

                    const hasText = !!(
                        p.selftext && p.selftext.trim().length > 30
                    );
                    const imageUrl = extractImageUrl(p);
                    if (!hasText && !imageUrl) continue;
                    if (!hasText && imageUrl && p.title.length < 20) continue;

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

        const textPosts = allLore
            .filter((l) => l.hasText)
            .sort((a, b) => b.score - a.score);
        const imagePosts = allLore
            .filter((l) => !l.hasText && l.imageUrl)
            .sort((a, b) => b.score - a.score);

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

/** Cache fillers */
export async function fillJokesCache(count = BATCH_SIZE): Promise<number> {
    const jokes = await fetchJokesFromAPI(count);
    if (!jokes.length) return 0;

    const multi = redis.multi();
    jokes.forEach((j) => multi.rPush(JOKE_QUEUE_KEY, JSON.stringify(j)));
    multi.expire(JOKE_QUEUE_KEY, CACHE_TTL);
    await multi.exec();

    console.log(`[joke-cache] Added ${jokes.length} jokes`);
    return jokes.length;
}

export async function fillDadJokesCache(count = BATCH_SIZE): Promise<number> {
    const jokes = await fetchDadJokesFromAPI(count);
    if (!jokes.length) return 0;

    const multi = redis.multi();
    jokes.forEach((j) => multi.rPush(DADJOKE_QUEUE_KEY, JSON.stringify(j)));
    multi.expire(DADJOKE_QUEUE_KEY, CACHE_TTL);
    await multi.exec();

    console.log(`[dadjoke-cache] Added ${jokes.length} dad jokes`);
    return jokes.length;
}

export async function fillLoreCache(): Promise<number> {
    const lore = await fetchLoreFromReddit();
    if (!lore.length) return 0;

    const multi = redis.multi();
    lore.forEach((l) => multi.rPush(LORE_QUEUE_KEY, JSON.stringify(l)));
    multi.expire(LORE_QUEUE_KEY, CACHE_TTL);
    await multi.exec();

    const textCount = lore.filter((l) => l.hasText).length;
    const imageCount = lore.length - textCount;
    console.log(
        `[lore-cache] Added ${lore.length} lore (${textCount} text, ${imageCount} images)`
    );
    return lore.length;
}

/** Pop helpers */
export async function popJoke(): Promise<Joke | null> {
    let raw = await redis.lPop(JOKE_QUEUE_KEY);

    if (!raw) {
        console.log("[joke-cache] Empty, refilling...");
        await fillJokesCache();
        raw = await redis.lPop(JOKE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await redis.lLen(JOKE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillJokesCache();

    try {
        return JSON.parse(raw) as Joke;
    } catch {
        return null;
    }
}

export async function popDadJoke(): Promise<DadJoke | null> {
    let raw = await redis.lPop(DADJOKE_QUEUE_KEY);

    if (!raw) {
        console.log("[dadjoke-cache] Empty, refilling...");
        await fillDadJokesCache();
        raw = await redis.lPop(DADJOKE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await redis.lLen(DADJOKE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillDadJokesCache();

    try {
        return JSON.parse(raw) as DadJoke;
    } catch {
        return null;
    }
}

export async function popLore(): Promise<Lore | null> {
    let raw = await redis.lPop(LORE_QUEUE_KEY);

    if (!raw) {
        console.log("[lore-cache] Empty, refilling...");
        await fillLoreCache();
        raw = await redis.lPop(LORE_QUEUE_KEY);
    }

    if (!raw) return null;

    const remaining = await redis.lLen(LORE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillLoreCache();

    try {
        return JSON.parse(raw) as Lore;
    } catch {
        return null;
    }
}

/** Initialize all caches on startup */
export async function initJokeCaches() {
    console.log("[caches] Initializing joke and lore caches...");
    await Promise.all([fillJokesCache(), fillDadJokesCache(), fillLoreCache()]);
}
