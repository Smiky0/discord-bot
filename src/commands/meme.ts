import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { popMeme } from "../utils/memeFetcher.js";
import { EmbedBuilder } from "discord.js";

export async function handleMeme(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const meme = await popMeme();
    if (!meme) {
        return interaction.editReply(
            "No memes available. Try again in a moment."
        );
    }

    const embed = new EmbedBuilder()
        .setTitle(meme.title)
        .setURL(meme.postLink || meme.url)
        .setImage(meme.url)
        .setFooter({ text: `r/${meme.subreddit}` });

    return interaction.editReply({ embeds: [embed] });
}
