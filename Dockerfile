FROM node:20.19.3

WORKDIR /app

# Copy source code
COPY . .

# Install pnpm
RUN npm install -g pnpm

# Install all dependencies
RUN pnpm install

# Build TypeScript
RUN pnpm run build

# Start your bot
CMD ["node", "dist/index.js"]