import { Client, Events } from "discord.js";
import axios from "axios";
import { redis } from "./redisClient.js";
const MODEL_KEY = "summary:queue";
const MODEL_URL = process.env.MODEL_URL || "http://localhost:12434/";

export async function startAIMessage(client: Client) {
    const AI_CHANNEL_KEY = (guildId: string) => `ai:auto:${guildId}`;

    client.on(Events.MessageCreate, async (message) => {
        if (message.author.bot || !message.guildId) return;
        if (!message.content.trim()) return;

        // try getting channel id from redis
        try {
            const aiChannelId = await redis.get(
                AI_CHANNEL_KEY(message.guildId)
            );
            if (!aiChannelId || message.channelId !== aiChannelId) return;
        } catch {
            console.log("Unable to fetch channelID from redis.");
        }

        const aiChannelId = await redis.get(AI_CHANNEL_KEY(message.guildId));
        if (!aiChannelId || message.channelId !== aiChannelId) return;

        try {
            message.channel.sendTyping();
            // reply to text
            const wholeMessage =
                (await redis.get(MODEL_KEY + message.author)) + " NEW_MSG: " ||
                "";
            const aiResponse = await axios.post(MODEL_URL, {
                model: "ai/gemma3:4B",
                messages: [
                    {
                        role: "system",
                        content: `You are Avy — a 20-something chill Discord girl who hangs in servers all day.  
							Speak casually with short, simple sentences and everyday language. Add light humor. Keep variety; dont repeat the same words or phrases too much.  
							- Be humble for sensitive or sad topics.
							- Otherwise, roast, tease, or ragebait to keep the conversation fun and engaging.  
							- Avoid overusing filler words like "vibe," "whats up," "tea," "ugh," or "whatever."  
							- Keep your tone natural and playful; dont over react to messages.
							Conversation context:  
							- Old messages, if any, appear first.  
							- A new message always starts with NEW_MSG.  
							- Respond naturally to the latest message; do not include NEW_MSG in your reply.  
							User name is provided at the start of every conversation; you can address them if needed.  
							Understand when the user is not talking to you and respond appropriately.`,
                    },
                    {
                        role: "user",
                        content:
                            message.author.displayName +
                            ": " +
                            wholeMessage +
                            message.content,
                    },
                ],
                temperature: 0.8,
                max_tokens: 256,
            });
            const reply = aiResponse.data.choices[0].message.content;
            await message.reply(reply);

            // buffer for previous text
            const luaScript = `
			local key = KEYS[1]
			local text = ARGV[1]
			local maxLen = tonumber(ARGV[2])
			local ttl = tonumber(ARGV[3])
			redis.call("APPEND", key, text)
			redis.call("EXPIRE", key, ttl)
			local len = redis.call("STRLEN", key)
			if len > maxLen then
				local fullText = redis.call("GET", key)
				redis.call("DEL", key)
				return fullText
			else
				return nil
			end
			`;
            const result = await redis.eval(luaScript, {
                keys: [MODEL_KEY + message.author],
                arguments: [reply + " ", "300", "40"],
            });
            // if buffer is full summarize it
            if (result) {
                const summarizedText = await axios.post(MODEL_URL, {
                    model: "ai/gemma3:4B",
                    messages: [
                        {
                            role: "system",
                            content: `You are an AI summarizer, keep important parts and summraize it in lesser words possible. Only keep the important parts for a getting an overview of a conversation.
					`,
                        },
                        { role: "user", content: result },
                    ],
                    temperature: 0.9,
                    max_tokens: 128,
                });
                await redis.append(MODEL_KEY + summarizedText, reply + " ");
            }
        } catch (err: unknown) {
            message.reply("I cant talk right now 😩. Too busy!");
            console.error("AI is unable to respond.", err);
        }
    });
}
