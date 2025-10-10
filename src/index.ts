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
import { handleAutoAI } from "./commands/autoAI.js";
import { startAIMessage } from "./utils/replyWIthAI.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

let isReady = false;

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

    // init jokes/lore cache
    try {
        await fillCache();
        await initJokeCaches();
        console.log("✅ Caches initialized");
    } catch (err: any) {
        console.error("⚠️ Jokes/Lore cache init failed:", err.message);
    }

    // start automeme scheduler
    try {
        startScheduler(client);
    } catch (err: any) {
        console.error("⚠️ Meme scheduler start failed:", err.message);
    }

    // start AI messages
    try {
        startAIMessage(client);
    } catch (err: any) {
        console.error("⚠️ Failed to init AI chat.", err.message);
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
            case "aichat":
                return await handleAutoAI(interaction);
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
