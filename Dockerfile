FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY admin/ ./admin/
COPY index.html ./
COPY assets/ ./assets/
COPY scripts/ ./scripts/
# Pass Supabase config as build args so they get injected into both admin and menu
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
# Write .env for Vite to pick up during build
RUN printf "VITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\n" \
    "$VITE_SUPABASE_URL" "$VITE_SUPABASE_ANON_KEY" > admin/.env
RUN cd admin && npm install && npm run build && cd ..
RUN node scripts/prepare-dist.js
# Verify menu HTML is at dist root (not admin HTML)
RUN head -3 dist/index.html

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "dist", "-l", "3000", "-s"]
