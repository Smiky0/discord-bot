import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export async function handleHelp(interaction: ChatInputCommandInteraction) {
    const helpEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📚 Bot Commands")
        .setDescription("Here are all available commands:")
        .addFields(
            {
                name: "/aichat",
                value: "Set/Remove channel to get *human like* replies from AI.",
                inline: false,
            },
            { name: "/joke", value: "Get a random joke", inline: false },
            { name: "/dadjoke", value: "Get a random dad joke", inline: false },
            {
                name: "/internetlore",
                value: "Get a lore from reddit",
                inline: false,
            },
            { name: "/meme", value: "Post a meme", inline: false },
            {
                name: "/automeme",
                value: "Set/Remove channel for posting memes automatically. ",
                inline: false,
            },
            { name: "/ping", value: "Check bot response time", inline: false },
            { name: "/help", value: "Shows this help message", inline: false }
        )
        .setFooter({ text: "Use / to see all available commands" })
        .setTimestamp();

    await interaction.reply({ embeds: [helpEmbed] });
}
