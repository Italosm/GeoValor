# Use uma imagem oficial do Node.js como base
FROM node:lts-alpine


# Defina o diretório de trabalho no contêiner
WORKDIR /usr/src/app

# Copie os arquivos de manifesto de pacotes
COPY package.json pnpm-lock.yaml ./

# Instale o pnpm e as dependências
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copie o restante do código-fonte da aplicação
COPY . .

# Instale os navegadores do Playwright e suas dependências
RUN pnpm exec playwright install --with-deps

# Sua aplicação expõe a porta 3001 para health/metrics
EXPOSE 3001

# Comando para iniciar sua aplicação
CMD [ "pnpm", "run", "dev" ]
