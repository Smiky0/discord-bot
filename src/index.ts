import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { handlePing } from "./commands/ping.js";
import { handleHelp } from "./commands/help.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	switch (interaction.commandName) {
		case "ping":
			return handlePing(interaction);
	}
})

client.login(process.env.TOKEN);
