FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production SERVE_CLIENT=true
RUN apk add --no-cache postgresql-client
COPY server/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist
RUN mkdir -p ./uploads/products ./backups
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
