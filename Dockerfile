FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source
COPY . .

# Build the frontend
RUN cd client && npx vite build

# Prune devDependencies
RUN npm prune --production

# Expose port
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "server/index.js"]
