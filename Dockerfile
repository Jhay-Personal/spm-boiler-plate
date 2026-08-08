# Admin Portal — production image
#
# Node 22 (active LTS). Next 16 requires >= 20.9, but Node 20 is out of
# maintenance, so the floor is set higher deliberately.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching. `npm ci` installs
# exactly what package-lock.json pins — `npm install` can silently resolve
# different transitive versions than the ones that were tested.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build.
COPY . .
RUN npm run build

# Uploads are written at runtime; create the directory with the right owner
# before dropping privileges.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

# Don't run the server as root.
USER node

EXPOSE 3000

# On start: apply the schema and ensure the first admin exists, then serve.
# init-db is idempotent and never overwrites an existing password.
CMD ["sh", "-c", "npm run init-db && npm run start -- -p 3000 -H 0.0.0.0"]
