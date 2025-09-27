import "dotenv/config";
import { REST, Routes } from "discord.js";

const commands = [
    {
        name: "ping",
        description: "Checks server ping",
    },
];

const token = process.env.TOKEN;
const rest = new REST({ version: "10" }).setToken(token || "");

async () => {
    try {
    } catch {}
};
