import {
    ChannelType,
    MessageFlags,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type GuildTextBasedChannel,
} from "discord.js";
import { redis } from "../utils/redisClient.js";

const REDIS_KEY = (guildId: string) => `ai:auto:${guildId}`;

async function setAIChannel(guildId: string, channelId: string) {
    await redis.set(REDIS_KEY(guildId), channelId);
}

async function disableAIChannel(guildId: string) {
    await redis.del(REDIS_KEY(guildId));
}

async function getAIChannel(guildId: string) {
    return redis.get(REDIS_KEY(guildId));
}

export async function handleAutoAI(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (!guildId) {
        return interaction.reply({
            content: "This command can only be used in servers.",
            flags: MessageFlags.Ephemeral,
        });
    }

    const canManageGuild = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
    );

    if (!canManageGuild && sub !== "status") {
        return interaction.reply({
            content:
                "❌ You need the Manage Server permission to modify AI chat settings.",
            flags: MessageFlags.Ephemeral,
        });
    }

    try {
        if (sub === "set") {
            const channelOption = interaction.options.getChannel(
                "channel",
                true
            );

            if (channelOption.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: "❌ Please select a text channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            const fetched = await interaction.client.channels.fetch(
                channelOption.id
            );
            if (!fetched || !fetched.isTextBased() || fetched.isDMBased()) {
                return interaction.reply({
                    content:
                        "❌ Invalid channel. Please select a text channel.",
                    flags: MessageFlags.Ephemeral,
                });
            }
            const channel = fetched as GuildTextBasedChannel;

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

            await setAIChannel(guildId, channel.id);

            return interaction.reply({
                content: `✅ AI chat enabled in <#${channel.id}>.`,
            });
        }

        if (sub === "disable") {
            const current = await getAIChannel(guildId);
            if (!current) {
                return interaction.reply({
                    content: "ℹ️ AI chat isn't currently enabled.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            await disableAIChannel(guildId);

            return interaction.reply({
                content: "✅ AI chat disabled.",
            });
        }

        if (sub === "status") {
            const current = await getAIChannel(guildId);
            if (!current) {
                return interaction.reply({
                    content: "ℹ️ AI chat channel is not set.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            return interaction.reply({
                content: `📍 AI chat is enabled in <#${current}>.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        return interaction.reply({
            content: "❌ Unknown subcommand.",
            flags: MessageFlags.Ephemeral,
        });
    } catch (err) {
        console.error("[autoAI] Command failed:", err);
        const errorMsg =
            err instanceof Error
                ? err.message
                : "❌ Failed to update AI settings. Please try again.";

        if (interaction.replied || interaction.deferred) {
            return interaction.editReply({ content: errorMsg });
        }

        return interaction.reply({
            content: errorMsg,
            flags: MessageFlags.Ephemeral,
        });
    }
}
