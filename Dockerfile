# Herbal Holland: the production image (Next.js standalone output).
FROM node:22-bookworm-slim AS base
# OpenSSL: Prisma's migration engine needs libssl, and Apple Wallet passes are signed with the openssl command.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 UPLOAD_DIR=/data/uploads
# prisma.config.ts needs a DATABASE_URL to load, though generating the client and building never connect to it.
RUN DATABASE_URL=postgresql://build@localhost/build sh -c 'npx prisma generate && npm run build' && mkdir -p /data/uploads && chown 1001 /data/uploads

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads
RUN useradd --system --uid 1001 app && mkdir -p /data/uploads && chown app /data/uploads
# Headless Chromium (the build Playwright pins, with its system libraries) prints the PDFs attached to invoice and
# statement emails (src/server/pdf.ts). Adds about 850 MB to the image; without it emails still go, just without the PDF.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN --mount=from=deps,source=/app/node_modules/playwright-core,target=/tmp/playwright-core \
    node /tmp/playwright-core/cli.js install --with-deps chromium-headless-shell && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
# Whole: Next's file tracing misses files playwright-core loads at run time (browsers.json and others).
COPY --from=deps /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations and admin scripts run in a one-off container from the build stage (docker-compose.prod.yml → migrate).
# Banking slips live in /data/uploads when no S3/R2 bucket is set: mount a volume there and back it up.
VOLUME /data/uploads
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
