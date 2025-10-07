import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { popDadJoke } from "../utils/jokeFetcher.js";

export async function handleDadJoke(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const joke = await popDadJoke();
    if (!joke) {
        return interaction.editReply(
            "No dad jokes available right now. Try again in a moment!"
        );
    }

    const embed = new EmbedBuilder()
        .setTitle("~ Dad Joke")
        .setDescription(joke.joke)
        .setColor("#4A90E2")
        .setFooter({ text: "icanhazdadjoke.com" });

    return interaction.editReply({ embeds: [embed] });
}
