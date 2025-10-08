import { createClient, type RedisClientType } from "redis";
import { config } from "../utils/config.js";

// Explicit type annotation
export const redis: RedisClientType = createClient({ url: config.redis.url });

redis.on("connect", () => console.log("✅ [redis] Connected"));
redis.on("error", (err) => console.error("[redis] Error:", err));
redis.on("end", () => console.warn("[redis] Disconnected"));

// Connect immediately
await redis.connect();
