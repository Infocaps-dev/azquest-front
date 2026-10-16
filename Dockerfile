# Front do Piloto AZ Quest.
#
# Duas etapas: a primeira constroi o bundle, a segunda so serve. A imagem
# final nao tem Node nem node_modules, e fica em torno de 50 MB.

FROM node:22-alpine AS build

WORKDIR /app

# package.json e lock separados do resto: enquanto as dependencias nao mudam,
# o `npm ci` vem do cache e o build so refaz o bundle.
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/

# Sem .env: `vite build` roda em modo producao e nao le o .env.development.
# Os flags VITE_*_MOCK ficam indefinidos, o que e o mesmo que false.
# E o que se quer no ar: nenhuma tela servindo dado de mentira.
RUN npm run build


# A base unprivileged ja escuta na 8080 e roda como usuario nao-root, que e o
# que o Code Engine pede. A nginx comum escuta na 80 como root.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

EXPOSE 8080
