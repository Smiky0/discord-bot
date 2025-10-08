# 🤖 Discord Bot & Meme Engine

![Bot Banner](https://img.shields.io/badge/Discord-Bot-blue?style=for-the-badge) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge) ![Docker](https://img.shields.io/badge/Docker-Ready-0db7ed?style=for-the-badge)

> A modern Discord bot delivering memes, jokes, and server utilities with Redis-backed caching.

---

## ✨ Features

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

## 🧪 Scripts

| Command               | Purpose              |
|-----------------------|---------------------|
| `pnpm dev`            | Hot-reload dev mode |
| `pnpm build`          | Compile TypeScript  |
| `pnpm start`          | Run compiled bot    |
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