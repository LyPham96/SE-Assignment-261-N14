FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build && npm run build -w server

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package*.json ./
COPY server/package.json server/
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./server/dist
COPY server/migrations ./server/migrations
COPY server/migrations-m1-m2 ./server/migrations-m1-m2
COPY server/src/*.mjs ./server/src/
COPY server/config ./server/config
COPY server/schema.mjs ./server/schema.mjs
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "server"]

FROM nginx:alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
