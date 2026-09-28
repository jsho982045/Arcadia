# Runs the site (port 3000) and the play server (port 3001) in one container.
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
ENV NODE_ENV=production STORAGE_DIR=/data/storage PGLITE_DIR=/data/pglite
COPY --from=build /app ./
VOLUME /data
EXPOSE 3000 3001
CMD ["sh", "-c", "npm run db:migrate && npm start"]
