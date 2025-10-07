import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { popLore } from "../utils/jokeFetcher.js";

export async function handleLore(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const lore = await popLore();
    if (!lore) {
        return interaction.editReply(
            "No lore available right now. Try again in a moment!"
        );
    }

    const embed = new EmbedBuilder()
        .setTitle(
            lore.title.length > 256
                ? lore.title.slice(0, 253) + "..."
                : lore.title
        )
        .setURL(lore.url)
        .setColor("#9B59B6")
        .setFooter({
            text: `r/${lore.subreddit} • u/${lore.author} • 👍 ${lore.score}`,
        });

    // Add text if available (truncate if too long)
    if (lore.text && lore.text.length > 0) {
        const description =
            lore.text.length > 4096
                ? lore.text.slice(0, 4093) + "..."
                : lore.text;
        embed.setDescription(description);
    }

    // Add image if available
    if (lore.imageUrl) {
        embed.setImage(lore.imageUrl);
    }

    return interaction.editReply({ embeds: [embed] });
}
