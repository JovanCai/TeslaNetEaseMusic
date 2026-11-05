FROM node:24-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./dist
ENV DIST_DIR=/app/dist
EXPOSE 80
CMD ["node", "src/index.js"]
