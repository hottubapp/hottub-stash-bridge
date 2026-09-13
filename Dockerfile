FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV BRIDGE_HOST=0.0.0.0
ENV BRIDGE_PORT=3099
ENV STASH_URL=http://stash:9999

EXPOSE 3099

CMD ["node", "src/index.js"]
