import { type RedisClientType } from "redis";
import { createClient } from "redis";

const redis: RedisClientType = createClient({
    url: "redis://172.23.172.138:6379",
});

redis.on("error", (err) => console.error("Redis error:", err));

await redis.connect();

export default redis;
