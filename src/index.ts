import { ActivityType, Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./utils/config.js";
import { fillCache, startScheduler } from "./utils/memeFetcher.js";
import { initJokeCaches } from "./utils/jokeFetcher.js";
import { handlePing } from "./commands/ping.js";
import { handleHelp } from "./commands/help.js";
import { handleMeme } from "./commands/meme.js";
import { handleMemeAuto } from "./commands/meme-auto.js";
import { handleJoke } from "./commands/joke.js";
import { handleDadJoke } from "./commands/dadjoke.js";
import { handleLore } from "./commands/lore.js";
import { deployCommands } from "./registerCommands.js";
import axios from "axios";
import { EventEmitter } from "stream";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
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

// bot listen to chat
client.on(Events.MessageCreate, async (interaction) => {
    if (interaction.author.bot) return;
    if (!interaction.content.trim()) return;
    try {
        const aiResponse = await axios.post(MODEL_URL, {
            model: "ai/gemma3:4B",
            message: interaction.content,
            temperature: 0.8,
            max_tokens: 256,
        });
        interaction.reply(aiResponse.data);
    } catch (err: unknown) {
        console.error("AI is unable to respond.");
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
            case "lore":
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
