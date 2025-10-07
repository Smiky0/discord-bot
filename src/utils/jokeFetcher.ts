import axios from "axios";
import Redis from "ioredis";
import { config } from "../utils/config.js";

const JOKE_QUEUE_KEY = "jokes:queue";
const DADJOKE_QUEUE_KEY = "dadjokes:queue";
const CACHE_TTL = 2 * 60 * 60; // 2 hours
const BATCH_SIZE = 30;
const LOW_THRESHOLD = 3;

type Joke = {
    setup: string;
    delivery: string;
    category?: string;
    type: "twopart" | "single";
    joke?: string; // for single-line jokes
};

type DadJoke = {
    joke: string;
    id: string;
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
        // icanhazdadjoke doesn't support bulk fetch, so we fetch one by one
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

    // Background refill when low
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

    // Background refill when low
    const remaining = await r.llen(DADJOKE_QUEUE_KEY);
    if (remaining < LOW_THRESHOLD) void fillDadJokesCache();

    try {
        return JSON.parse(raw) as DadJoke;
    } catch {
        return null;
    }
}

// Initialize joke caches on bot startup
export async function initJokeCaches() {
    console.log("[jokes] Initializing caches...");
    await Promise.all([fillJokesCache(), fillDadJokesCache()]);
}
