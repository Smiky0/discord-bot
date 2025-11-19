import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("[search] GEMINI_API_KEY missing; search command disabled");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const groundingTool = {
    googleSearch: {},
};

const config = {
    tools: [groundingTool],
};

const MAX_QUERY_LENGTH = 512;
const MAX_DISCORD_LENGTH = 1900;
const PROMPT_PREFIX =
    "Answer very concisely (max ~2 sentences). Provide only the key fact(s).";

export async function handleSearch(interaction: ChatInputCommandInteraction) {
    const replyEarly = (content: string) => interaction.reply({ content });

    if (!ai) {
        return replyEarly(
            "🔒 Search is unavailable: missing GEMINI_API_KEY configuration."
        );
    }

    const query = interaction.options.getString("query", false)?.trim();
    if (!query) {
        return replyEarly("❌ Please provide something to search.");
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return replyEarly(
            `❌ Search query too long (>${MAX_QUERY_LENGTH} characters).`
        );
    }

    await interaction.deferReply();

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `${PROMPT_PREFIX}\n\nQuestion: ${query}`,
                        },
                    ],
                },
            ],
            config,
        });

        const text = response.text?.trim();
        if (!text) {
            return interaction.editReply(
                "🤷 Sorry, I couldn't find anything useful."
            );
        }

        const truncated = text.length > MAX_DISCORD_LENGTH;
        const answer = truncated
            ? `${text.slice(0, MAX_DISCORD_LENGTH)}\n\n_(response truncated)_`
            : text;

        const embed = new EmbedBuilder()
            .setColor(0x4285f4)
            .setTitle("🔎 Search result")
            .addFields({
                name: "Question",
                value:
                    query.length > 1024 ? `${query.slice(0, 1021)}...` : query,
            })
            .setDescription(answer)
            .setFooter({ text: "Powered by Google Search" });

        return interaction.editReply({ embeds: [embed] });
    } catch (err: any) {
        console.error("[search] Command failed:", err);

        const reason =
            err?.response?.status === 429
                ? "Rate limit hit. Please try again in a bit."
                : err?.message || "Unexpected error while searching.";

        return interaction.editReply(`❌ Search failed: ${reason}`);
    }
}
