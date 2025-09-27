import { ChatInputCommandInteraction } from "discord.js";

export async function handlePing(interaction: ChatInputCommandInteraction) {
    await interaction.reply("Pinging...");
    const sent = await interaction.fetchReply();
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await sent.edit(`Pong! Latency: ${latency}ms`);
}
