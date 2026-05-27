FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

RUN npm install --legacy-peer-deps

COPY src ./src

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./

RUN npm install --only=production --legacy-peer-deps

COPY --from=builder /app/dist ./dist

EXPOSE 3050

CMD ["node", "dist/main"]
