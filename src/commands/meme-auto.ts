import {
    MessageFlags,
    type ChatInputCommandInteraction,
    ChannelType,
    type GuildTextBasedChannel,
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
            content: "❌ This command only works in servers.",
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        if (sub === "set") {
            const channelOption = interaction.options.getChannel(
                "channel",
                true
            );
            const interval = interaction.options.getInteger("interval") ?? 120;

            // Validate channel type
            if (channelOption.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: "❌ Please select a text channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Validate interval
            if (interval < 5 || interval > 1440) {
                return interaction.reply({
                    content: "❌ Interval must be between 5 and 1440 minutes.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Fetch the full channel object to check permissions
            let channel: GuildTextBasedChannel;
            try {
                const fetchedChannel = await interaction.client.channels.fetch(
                    channelOption.id
                );
                if (
                    !fetchedChannel ||
                    !fetchedChannel.isTextBased() ||
                    fetchedChannel.isDMBased()
                ) {
                    return interaction.reply({
                        content:
                            "❌ Invalid channel. Please select a text channel.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
                channel = fetchedChannel as GuildTextBasedChannel;
            } catch (err) {
                return interaction.reply({
                    content: "❌ Unable to access that channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check bot permissions in the actual channel
            const botMember = await interaction.guild?.members.fetchMe();
            if (!botMember) {
                return interaction.reply({
                    content: "❌ Unable to verify bot permissions.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const permissions = channel.permissionsFor(botMember);
            if (!permissions?.has(["SendMessages", "EmbedLinks"])) {
                return interaction.reply({
                    content:
                        "❌ I don't have permission to send messages with embeds in that channel.",
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
            const cfg = await getAutoConfig(guildId);
            if (!cfg) {
                return interaction.reply({
                    content: "ℹ️ Auto memes are not currently enabled.",
                    flags: MessageFlags.Ephemeral,
                });
            }

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
                    content:
                        "ℹ️ Auto memes not configured for this server.\nUse `/meme-auto set` to enable.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const intervalMin = Math.floor(cfg.intervalMs / 60000);
            const nextMin = Math.max(
                0,
                Math.floor((cfg.nextAt - Date.now()) / 60000)
            );

            // Check if channel still exists
            try {
                await interaction.client.channels.fetch(cfg.channelId);
            } catch {
                return interaction.reply({
                    content: `⚠️ **Auto Meme Status**\nChannel: <#${cfg.channelId}> (channel deleted or inaccessible)\nUse \`/meme-auto set\` to reconfigure.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            return interaction.reply({
                content: `📊 **Auto Meme Status**\nChannel: <#${cfg.channelId}>\nInterval: ${intervalMin} min\nNext meme: ${nextMin} min`,
                flags: MessageFlags.Ephemeral,
            });
        }

        return interaction.reply({
            content: "❌ Unknown subcommand.",
            flags: MessageFlags.Ephemeral,
        });
    } catch (err: any) {
        console.error("[meme-auto] Command failed:", err);

        const errorMsg = err.message.includes("Redis")
            ? "❌ Database connection error. Please try again later."
            : "❌ Failed to update auto meme settings. Please try again.";

        if (interaction.replied || interaction.deferred) {
            return interaction.editReply({ content: errorMsg });
        }
        return interaction.reply({
            content: errorMsg,
            flags: MessageFlags.Ephemeral,
        });
    }
}
