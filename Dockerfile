# Runs the site ($PORT, default 3002) and the play server (3001) in one container.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_PLAY_ORIGIN=http://localhost:3001
ARG NEXT_PUBLIC_APP_NAME=Arcadia
ENV NEXT_PUBLIC_PLAY_ORIGIN=$NEXT_PUBLIC_PLAY_ORIGIN NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production STORAGE_DIR=/data/storage PGLITE_DIR=/data/pglite PLAY_PORT=3001
COPY --from=build /app ./
EXPOSE 3002 3001
CMD ["npm", "run", "start:prod"]
