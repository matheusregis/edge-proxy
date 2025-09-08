FROM node:18-alpine

# define diretório de trabalho
WORKDIR /app

# copia manifestos
COPY package*.json tsconfig.json ./

# instala dependências de produção e build
RUN npm install --production=false

# copia o restante do código
COPY . .

# compila o TS -> JS
RUN npm run build

# remove devDependencies pra imagem ficar leve
RUN npm prune --production

# expõe a porta
EXPOSE 8080

# inicia app já compilado
CMD ["node", "dist/index.js"]
