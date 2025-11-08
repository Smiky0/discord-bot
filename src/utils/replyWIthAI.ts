import { Client, Events } from "discord.js";
import axios from "axios";
import { redis } from "./redisClient.js";

const MODEL_URL = process.env.MODEL_URL || "http://localhost:12434/";
const MODEL_PROMPT = process.env.MODEL_SYSTEM_PROMPT;
const MAX_MESSAGES = 30; // per channel message limit
const HISTORY_KEY = (guildId: string, channelId: string) =>
    `channel:history:${guildId}:${channelId}`;

// fetch and parse channel history from Redis
async function getChannelHistory(guildId: string, channelId: string) {
    const raw = await redis.get(HISTORY_KEY(guildId, channelId));
    return raw ? JSON.parse(raw) : [];
}

// save channel history to Redis
async function saveChannelHistory(
    guildId: string,
    channelId: string,
    history: any[]
) {
    if (history.length > MAX_MESSAGES) {
        history = history.slice(-MAX_MESSAGES);
    }
    await redis.set(HISTORY_KEY(guildId, channelId), JSON.stringify(history), {
        EX: 60 * 10,
    }); // set ttl time to 10 min
    return history;
}

// per-channel queues
const channelQueues: Record<string, any[]> = {};
const channelProcessing: Record<string, boolean> = {};

async function processQueue(guildId: string, channelId: string) {
    const key = `${guildId}:${channelId}`;
    if (channelProcessing[key]) return; // already processing

    channelProcessing[key] = true;

    while (channelQueues[key] && channelQueues[key].length > 0) {
        const { message, history } = channelQueues[key].shift();

        // construct payload for AI
        const payload = {
            model: "ai/gemma3:4B",
            messages: [
                {
                    role: "system",
                    content: MODEL_PROMPT,
                },
                ...history.map((msg: any) => {
                    if (msg.role === "assistant")
                        return { role: "assistant", content: msg.content };
                    return {
                        role: "user",
                        content: `${msg.user}: ${msg.content}`,
                    };
                }),
            ],
            temperature: 0.7,
            max_tokens: 256,
            stream: false,
        };

        try {
            message.channel.sendTyping();
            const aiResponse = await axios.post(MODEL_URL, payload);
            const reply =
                aiResponse.data.choices?.[0]?.message?.content ||
                "Hmm, can't think of a reply.";

            await message.reply(reply);

            history.push({ role: "assistant", user: "Avy", content: reply });
            await saveChannelHistory(guildId, channelId, history);
        } catch (err) {
            console.error("AI response error:", err);
            await message.reply("I can't chat right now 😩. Too busy!");
        }
    }

    channelProcessing[key] = false;
}

export async function startAIMessage(client: Client) {
    const AI_CHANNEL_KEY = (guildId: string) => `ai:auto:${guildId}`;

    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot || !message.guildId) return;
        if (!message.content.trim()) return;

        const guildId = message.guildId;
        const channelId = message.channelId;
        const key = `${guildId}:${channelId}`;

        const botId = client.user?.id;
        const userName = message.author.displayName;
        const content = message.content.trim();
        const mentionedBot = botId ? message.mentions.users.has(botId) : false;
        let repliedToBot = false;

        if (botId && message.reference?.messageId) {
            try {
                const referenced = await message.fetchReference();
                repliedToBot = referenced.author?.id === botId;
            } catch (err) {
                console.warn(
                    "[ai-chat] Unable to fetch referenced message",
                    err
                );
            }
        }

        // check if this is the active AI channel
        let aiChannelId;
        try {
            aiChannelId = await redis.get(AI_CHANNEL_KEY(guildId));
            if (!aiChannelId) {
                console.log("No AI channel configured for guild", guildId);
                return;
            }

            // If message is in the AI channel -> always handle it.
            // Otherwise (other channels) -> only handle if bot was mentioned or message is a reply to bot.
            if (message.channelId !== aiChannelId) {
                if (!mentionedBot && !repliedToBot) {
                    // Not in AI channel and not addressed to the bot -> ignore
                    return;
                }
            }
            // If we reach here: either it's AI channel (handle always) or it's another channel but mentioned/replied (handle)
        } catch {
            console.log("Unable to fetch AI channel ID from Redis.");
            return;
        }

        // fetch & update channel history
        let history = await getChannelHistory(guildId, channelId);
        history.push({ role: "user", user: userName, content });
        history = await saveChannelHistory(guildId, channelId, history);

        if (!channelQueues[key]) channelQueues[key] = [];
        channelQueues[key].push({ message, history: [...history] });

        // start processing the queue
        processQueue(guildId, channelId);
    });
}
