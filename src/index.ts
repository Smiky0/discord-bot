import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { config } from "./utils/config.js";

import { fillCache, startScheduler } from "./utils/memeFetcher.js";
import { handlePing } from "./commands/ping.js";
import { handleHelp } from "./commands/help.js";

import { handleMeme } from "./commands/meme.js";
import { handleMemeAuto } from "./commands/meme-auto.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`);

    await fillCache();
    startScheduler(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        switch (interaction.commandName) {
            case "ping":
                return await handlePing(interaction);
            case "help":
                return await handleHelp(interaction);

            case "meme":
                return await handleMeme(interaction);
            case "meme-auto":
                return await handleMemeAuto(interaction);
        }
    } catch (error) {
        console.error(`[command] ${interaction.commandName} failed:`, error);
        const reply = {
            content: "❌ Command failed. Please try again.",
            ephemeral: true,
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(reply).catch(() => {});
        } else {
            await interaction.reply(reply).catch(() => {});
        }
    }
});

client.on(Events.Error, (error) => console.error("[client]", error));
process.on("unhandledRejection", (error) =>
    console.error("[unhandled]", error)
);

client.login(config.discord.token);
