import { REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";
import { config } from "./utils/config";

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check bot latency"),

    new SlashCommandBuilder()
        .setName("help")
        .setDescription("Show available commands"),

    new SlashCommandBuilder()
        .setName("meme")
        .setDescription("Get a random meme"),

    new SlashCommandBuilder()
        .setName("meme-auto")
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
].map((c) => c.toJSON());

async function deploy() {
    const rest = new REST({ version: "10" }).setToken(config.discord.token);

    try {
        const route = config.discord.guildId
            ? Routes.applicationGuildCommands(
                  config.discord.applicationId,
                  config.discord.guildId
              )
            : Routes.applicationCommands(config.discord.applicationId);

        const scope = config.discord.guildId ? "guild" : "global";
        console.log(`Deploying ${commands.length} ${scope} commands...`);

        await rest.put(route, { body: commands });
        console.log(`✅ Commands deployed successfully`);
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

deploy();
