# 2ni Admin Portal — production image
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

EXPOSE 3000

# On start: apply schema + seed the admin, then launch the server.
CMD ["sh", "-c", "node scripts/init-db.js && npm run start -- -p 3000 -H 0.0.0.0"]
