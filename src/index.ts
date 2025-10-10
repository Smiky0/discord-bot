import { ActivityType, Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./utils/config.js";
import { fillCache, startScheduler } from "./utils/memeFetcher.js";
import { initJokeCaches } from "./utils/jokeFetcher.js";
import { handlePing } from "./commands/ping.js";
import { handleHelp } from "./commands/help.js";
import { handleMeme } from "./commands/meme.js";
import { handleMemeAuto } from "./commands/automeme.js";
import { handleJoke } from "./commands/joke.js";
import { handleDadJoke } from "./commands/dadjoke.js";
import { handleLore } from "./commands/lore.js";
import { deployCommands } from "./registerCommands.js";
import { redis } from "./utils/redisClient.js";
import axios from "axios";
const MODEL_KEY = "summary:queue";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

let isReady = false;
const MODEL_URL = process.env.MODEL_URL || "http://localhost:12434/";

// connects bot
client.once(Events.ClientReady, async (c: any) => {
    console.log(`✅ Logged in as ${c.user.tag}`);
    // set activity
    client.user?.setPresence({
        activities: [
            {
                name: "/help",
                type: ActivityType.Listening,
            },
        ],
        status: "online",
    });

    try {
        await fillCache();
        await initJokeCaches();
        console.log("✅ Caches initialized");
    } catch (err: any) {
        console.error("⚠️ Cache init failed:", err.message);
    }

    try {
        startScheduler(client);
    } catch (err: any) {
        console.error("⚠️ Scheduler start failed:", err.message);
    }

    isReady = true;
});

// Whenever the bot joins a new guild
client.on(Events.GuildCreate, async (guild) => {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    // deploy commands
    try {
        await deployCommands(guild.id);
        console.log(`Registered commands in ${guild.name}`);
    } catch (error) {
        console.error(`Failed to register commands for ${guild.name}:`, error);
    }
});

// bot reply with AI to chat
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.trim()) return;
    if (message.channelId != "1419787999310250136") return;
    console.log("AI bot is working....");
    try {
        message.channel.sendTyping();
        // reply for text
        const wholeMessage =
            (await redis.get(MODEL_KEY + message.author)) + " NEW_MSG: " || "";
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
							Understand when the user is not talking to you and respond appropriately.
					`,
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

// bot commands
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!isReady) {
        return interaction
            .reply({
                content:
                    "⏳ Bot is still starting up. Please try again in a moment.",
                flags: 64,
            })
            .catch(() => {});
    }
    // commands
    try {
        switch (interaction.commandName) {
            case "ping":
                return await handlePing(interaction);
            case "help":
                return await handleHelp(interaction);
            case "meme":
                return await handleMeme(interaction);
            case "automeme":
                return await handleMemeAuto(interaction);
            case "joke":
                return await handleJoke(interaction);
            case "dadjoke":
                return await handleDadJoke(interaction);
            case "internetlore":
                return await handleLore(interaction);
            default:
                return interaction.reply("Wrong command used.");
        }
    } catch (error: any) {
        console.error(
            `[command] ${interaction.commandName} failed:`,
            error.message
        );
        const reply = {
            content: `❌ Command failed: ${error.message || "Unknown error"}`,
            ephemeral: true,
        };

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(reply);
            } else {
                await interaction.reply(reply);
            }
        } catch {
            // Interaction expired or already handled
        }
    }
});

client.on(Events.Error, (error) => {
    console.error("[client] Error:", error.message);
});

client.on(Events.Warn, (info) => {
    console.warn("[client] Warning:", info);
});

process.on("unhandledRejection", (error: any) => {
    console.error("[unhandled] Rejection:", error?.message || error);
});

process.on("uncaughtException", (error: any) => {
    console.error("[uncaught] Exception:", error?.message || error);
    process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\n[shutdown] Gracefully shutting down...");
    client.destroy();
    process.exit(0);
});

client.login(config.discord.token).catch((err) => {
    console.error("❌ Failed to login:", err.message);
    process.exit(1);
});
