# Dockerfile for Next.js

# 1. Base image
FROM node:20-alpine AS base

# 2. Dependencies
FROM base AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
# Explicitly add binaries to PATH so 'npm run' commands find them
ENV PATH /app/node_modules/.bin:$PATH
COPY package.json package-lock.json* entrypoint.sh ./
RUN chmod +x entrypoint.sh
RUN npm install

ENTRYPOINT ["./entrypoint.sh"]

# 3. Builder
FROM base AS builder
WORKDIR /app
# Add path here too so 'npm run build' finds 'next'
ENV PATH /app/node_modules/.bin:$PATH
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 4. Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
# Only copy public if it exists
COPY --from=builder /app/public* ./public/
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
