# resumos-api (server/index.js) para o Code Engine. Só a API: o front não vai nesta imagem.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
