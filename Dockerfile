FROM node:20-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
ARG VITE_DEMO_SONG_ID
ARG VITE_REAL_IP
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./dist
ENV DIST_DIR=/app/dist
EXPOSE 80
CMD ["node", "src/index.js"]
