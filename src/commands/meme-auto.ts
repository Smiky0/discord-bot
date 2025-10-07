import {
    MessageFlags,
    type ChatInputCommandInteraction,
    ChannelType,
} from "discord.js";
import {
    setAutoMeme,
    disableAutoMeme,
    getAutoConfig,
} from "../utils/memeFetcher.js";

export async function handleMemeAuto(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
        return interaction.reply({
            content: "This command only works in servers.",
            flags: MessageFlags.Ephemeral,
        });
    }

    if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const interval = interaction.options.getInteger("interval") ?? 120;

        if (channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                content: "Please select a text channel.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await setAutoMeme(guildId, channel.id, interval);
        return interaction.reply({
            content: `✅ Auto memes enabled in <#${channel.id}> every ${interval} minutes.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    if (sub === "disable") {
        await disableAutoMeme(guildId);
        return interaction.reply({
            content: "✅ Auto memes disabled.",
            flags: MessageFlags.Ephemeral,
        });
    }

    if (sub === "status") {
        const cfg = await getAutoConfig(guildId);
        if (!cfg) {
            return interaction.reply({
                content: "Auto memes not configured for this server.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const intervalMin = Math.floor(cfg.intervalMs / 60000);
        const nextMin = Math.max(
            0,
            Math.floor((cfg.nextAt - Date.now()) / 60000)
        );

        return interaction.reply({
            content: `📊 **Auto Meme Status**\nChannel: <#${cfg.channelId}>\nInterval: ${intervalMin} min\nNext meme: ${nextMin} min`,
            flags: MessageFlags.Ephemeral,
        });
    }

    return interaction.reply({
        content: "Unknown subcommand.",
        flags: MessageFlags.Ephemeral,
    });
}
