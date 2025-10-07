import { ChatInputCommandInteraction, Message } from "discord.js";

export async function handleHelp(interaction: ChatInputCommandInteraction) {
    await interaction.reply("helping...");
}
