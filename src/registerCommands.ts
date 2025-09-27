import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.TOKEN;
const applicationId = process.env.APPLICATION_ID || "";
const guildId = process.env.GUILD_ID;

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with server ping!"),
    new SlashCommandBuilder().setName("help").setDescription("Show help"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token || "");
console.log("outside func");
async function main() {
    console.log("inside func");
    try {
        if (guildId && applicationId) {
            console.log("Refreshing guild slash commands");
            await rest.put(
                Routes.applicationGuildCommands(applicationId, guildId),
                { body: commands }
            );
            console.log("hitting guildid");
        } else {
            console.log("Refreshing global slash commands");
            await rest.put(Routes.applicationCommands(applicationId), {
                body: commands,
            });
            console.log("hitting no guildid");
        }
        console.log("Commands added!");
    } catch (err) {
        console.error("Failed to register commands");
        process.exit(1);
    }
}
main();
