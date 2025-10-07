import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { popJoke } from "../utils/jokeFetcher.js";

export async function handleJoke(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const joke = await popJoke();
    if (!joke) {
        return interaction.editReply(
            "No jokes available right now. Try again in a moment!"
        );
    }

    const embed = new EmbedBuilder().setColor("#FFA500");

    if (joke.type === "twopart") {
        embed
            .setTitle("~ Joke")
            .setDescription(`**${joke.setup}**\n\n||${joke.delivery}||`)
            .setFooter({
                text: joke.category
                    ? `Category: ${joke.category}`
                    : "Random Joke",
            });
    } else {
        embed
            .setTitle("~ Joke")
            .setDescription(joke.joke || "")
            .setFooter({
                text: joke.category
                    ? `Category: ${joke.category}`
                    : "Random Joke",
            });
    }

    return interaction.editReply({ embeds: [embed] });
}
