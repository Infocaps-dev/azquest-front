# resumos-api (server/index.js) para o Code Engine. Só a API: o front é a imagem do Dockerfile da raiz (nginx).
# Build a partir da raiz do repositório: ibmcloud ce app update --name resumos-api --build-source . \n#   --build-dockerfile server/Dockerfile
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
