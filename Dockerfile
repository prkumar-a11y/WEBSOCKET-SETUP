FROM node:20-bookworm-slim

WORKDIR /app
COPY server/package*.json /app/server/
RUN cd /app/server && npm install --omit=dev
COPY . /app

ENV NODE_ENV=production
CMD ["node", "server/server.js"]
