FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm install
COPY . .
RUN npm run db:generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production SERVE_CLIENT=true
COPY server/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist
RUN mkdir -p ./uploads/products
EXPOSE 5000
CMD ["node", "dist/index.js"]
