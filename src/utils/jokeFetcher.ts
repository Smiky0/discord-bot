import axios from "axios";
import { redis } from "./redisClient.js";

const JOKE_QUEUE_KEY = "jokes:queue";
const DADJOKE_QUEUE_KEY = "dadjokes:queue";
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
            `https://v2.jokeapi.dev/joke/Dark,Pun,Spooky?blacklistFlags=nsfw,racist,sexist,explicit&type=single&amount=${count}`,
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

/** Initialize all caches on startup */
export async function initJokeCaches() {
    console.log("[caches] Initializing joke and lore caches...");
    await Promise.all([fillJokesCache(), fillDadJokesCache()]);
}
