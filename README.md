# 🤖 Discord Bot With AI Chat and Memes

![Bot Banner](https://img.shields.io/badge/Discord-Bot-blue?style=for-the-badge) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge) ![Docker](https://img.shields.io/badge/Docker-Ready-0db7ed?style=for-the-badge)

> A modern Discord bot with AI chat, delivering memes, jokes, and server utilities with Redis-backed caching.

---

## ✨ Features

- 🗣️ `/aichat` AI chatter using gemma3 with history in Redis
- 🃏 `/joke`, `/dadjoke`, `/meme`, `/internetlore`, `/ping`, `/help`
- 🌀 `/automeme` scheduled meme drops with Redis caching
- ⚙️ Slash-command registration with application commands API
- 🧠 Redis-backed cache layer for instant responses
- 🐳 Docker + docker-compose deployment, Redis included

---

## 🏗️ Architecture

```
Discord Gateway ──▶ Bot (Node.js + TypeScript)
                         │
                         ├── Redis cache
                         └── External APIs (memes, jokes, lore)
```

---

## 🚀 Quick Start

```bash
# make sure redis is running

# install dependencies
pnpm install

# configure environment
mv .env.example .env

# run locally
pnpm dev
```

---

## 🧰 Environment

| Variable              | Description                        |
|----------------------|------------------------------------|
| `DISCORD_TOKEN`       | Bot token                          |
| `DISCORD_CLIENT_ID`   | Application client ID              |
| `DISCORD_GUILD_ID`    | Guild for command registration     |
| `REDIS_URL`           | Redis connection string            |
| `MODEL_URL`           | Base URL for the AI chat service   |

---

## 🐳 Docker

```bash
# build + start
docker compose up -d --build

# logs
docker compose logs -f bot

# stop
docker compose down
```

---

## 🗣️ AI Chat

- Point `MODEL_URL` to a compatible chat-completions endpoint (defaults to `http://localhost:12434/`).
- Set the active channel with `/aichat set channel:#your-channel` (requires Manage Server).
- Check status anytime with `/aichat status`, or disable via `/aichat disable`.
- Messages in the AI channel are queued per-channel and trimmed to the last 20 entries for context.

---

## 🧪 Scripts

| Command               | Purpose              |
|-----------------------|---------------------|
| `pnpm dev`            | Hot-reload dev mode |
| `pnpm build`          | Compile TypeScript  |
| `pnpm start`          | Run compiled bot    |
| `pnpm test`          	| Run test bot	      |
| `pnpm deploy:commands`| Register slash cmds |

---

## 🤝 Contributing

Pull requests, issues, and suggestions are welcome!  
1. Fork the repo  
2. Create a feature branch  
3. Submit a PR 🎉

---

## 📜 License

MIT — feel free to use and remix.