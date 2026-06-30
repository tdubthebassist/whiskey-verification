FROM node:20-alpine AS build
WORKDIR /app

# Copy all project files
COPY package.json ./
COPY admin/ ./admin/
COPY index.html ./
COPY assets/ ./assets/
COPY scripts/ ./scripts/

# Write admin .env from build args for Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN printf "VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n" \
    "$VITE_SUPABASE_URL" "$VITE_SUPABASE_ANON_KEY" > admin/.env

# Build admin and prepare dist
RUN cd admin && npm install && npm run build
RUN node scripts/prepare-dist.js

# Verify dist has menu HTML (not admin HTML)
RUN head -3 dist/index.html && echo "---" && ls -la dist/ && echo "---" && ls -la dist/admin/

# Production image
FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve@latest
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD sh -c "serve dist -l \${PORT:-3000} -s"
