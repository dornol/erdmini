# ---- Build stage ----
FROM node:26-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install --global pnpm@10.30.1

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .

ARG PUBLIC_SITE_URL=https://erdmini.dornol.dev
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL

RUN pnpm build

# ---- Serve stage ----
FROM nginx:alpine

# Copy built output
COPY --from=builder /app/build /usr/share/nginx/html

# Custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
