import {
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType,
    Guild,
} from "discord.js";
import { config } from "./utils/config.js";

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check bot latency"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show available commands"),

    new SlashCommandBuilder()
        .setName("joke")
        .setDescription("Get a random joke"),

    new SlashCommandBuilder()
        .setName("dadjoke")
        .setDescription("Get a random da joke"),

    new SlashCommandBuilder()
        .setName("meme")
        .setDescription("Get a random meme"),

    new SlashCommandBuilder()
        .setName("search")
        .setDescription("Get google search result")
        .setDMPermission(true)
        .addStringOption((option) =>
            option
                .setName("query")
                .setDescription("What do you want to search for?")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("automeme")
        .setDescription("Configure automatic meme posting")
        .addSubcommand((sub) =>
            sub
                .setName("set")
                .setDescription("Enable auto memes")
                .addChannelOption((o) =>
                    o
                        .setName("channel")
                        .setDescription("Channel to post memes")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addIntegerOption((o) =>
                    o
                        .setName("interval")
                        .setDescription("Minutes between posts (default: 120)")
                        .setMinValue(5)
                        .setMaxValue(1440)
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("disable").setDescription("Disable auto memes")
        )
        .addSubcommand((sub) =>
            sub.setName("status").setDescription("Check auto meme status")
        ),
    new SlashCommandBuilder()
        .setName("aichat")
        .setDescription("Configure AI chat channel.")
        .addSubcommand((sub) =>
            sub
                .setName("set")
                .setDescription("Enable AI chat.")
                .addChannelOption((o) =>
                    o
                        .setName("channel")
                        .setDescription("Channel to enable AI chat on.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("disable").setDescription("Disable AI chat.")
        )
        .addSubcommand((sub) =>
            sub
                .setName("status")
                .setDescription("Check AI chat channel status.")
        ),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.discord.token);

export async function deployCommands(guildId?: Guild["id"]) {
    try {
        const route = guildId
            ? Routes.applicationGuildCommands(
                  config.discord.applicationId,
                  guildId
              )
            : Routes.applicationCommands(config.discord.applicationId);

        const scope = guildId ? "guild" : "global";
        console.log(`Deploying ${commands.length} ${scope} commands...`);

        await rest.put(route, { body: commands });
        console.log(`✅ Commands deployed successfully`);
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

export async function clearGuildCommands(guildId: Guild["id"]) {
    try {
        console.log(`Clearing guild commands for ${guildId}...`);
        await rest.put(
            Routes.applicationGuildCommands(
                config.discord.applicationId,
                guildId
            ),
            { body: [] }
        );
        console.log(`✅ Guild commands cleared for ${guildId}`);
    } catch (error) {
        console.error(
            `❌ Failed to clear guild commands for ${guildId}:`,
            error
        );
        throw error;
    }
}

const guildOverride = process.env.GUILD_ID?.trim();
if (guildOverride) {
    void clearGuildCommands(guildOverride);
} else {
    void deployCommands();
}
