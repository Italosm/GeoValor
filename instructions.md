# Guia de Integração: Prometheus e Grafana

Este documento detalha os passos necessários para integrar o Prometheus e o Grafana ao projeto, permitindo um monitoramento robusto e visualização de métricas em tempo real.

## Visão Geral da Arquitetura

A integração é feita utilizando Docker Compose para orquestrar os seguintes serviços:

1.  **Aplicação (`qurbiz-scraper`):** A aplicação Node.js que expõe as métricas em um endpoint `/metrics`.
2.  **Prometheus:** O servidor que coleta (scrape) e armazena as métricas da aplicação.
3.  **Grafana:** A plataforma de visualização que consulta os dados do Prometheus e os exibe em painéis.
4.  **MongoDB:** O banco de dados utilizado pela aplicação.

## Passo 1: Instrumentação da Aplicação

O primeiro passo é fazer com que a aplicação exponha as métricas no formato que o Prometheus entende.

### 1.1. Adicionar Dependência

Instale a biblioteca `prom-client`:

```bash
pnpm add prom-client
```

### 1.2. Expor o Endpoint de Métricas

No arquivo principal da sua aplicação (ex: `src/common/infrastructure/http/server.ts`), adicione um servidor HTTP para expor as métricas.

```typescript
import http from 'http'
import client from 'prom-client'

const register = new client.Registry()
client.collectDefaultMetrics({ register }) // Coleta métricas padrão do Node.js

// ... (definição das suas métricas customizadas)

function startHealthCheckServer(): void {
    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/metrics') {
            try {
                res.setHeader('Content-Type', register.contentType)
                res.end(await register.metrics())
            } catch (ex) {
                res.writeHead(500).end(ex)
            }
        } else if (req.method === 'GET' && req.url === '/health') {
            // ... (lógica do health check)
        } else {
            res.writeHead(404).end('Not Found')
        }
    })

    server.listen(3001, () => {
        logger.info('Health check and metrics server listening on port 3001')
    })
}
```

### 1.3. Definir e Coletar Métricas

Defina as métricas que você deseja monitorar e incremente-as nos locais apropriados do seu código.

**Exemplo de definição de métrica:**

```typescript
const jobsProcessed = new client.Counter({
    name: 'jobs_processed_total',
    help: 'Total number of scrape jobs processed.',
    labelNames: ['provider', 'status'], // Ex: 'cohab', 'completed'
    registers: [register],
})
```

**Exemplo de uso:**

```typescript
// Dentro da função que marca um job como completo
jobsProcessed.labels(providerKey, 'completed').inc()

// Dentro da função que marca um job como falho
jobsProcessed.labels(providerKey, 'failed').inc()
```

## Passo 2: Configuração do Docker

Crie os seguintes arquivos e diretórios na raiz do projeto.

### 2.1. `Dockerfile`

Este arquivo define como a imagem Docker da sua aplicação será construída.

```dockerfile
# Use uma imagem oficial do Node.js como base
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec playwright install --with-deps

EXPOSE 3001

CMD [ "pnpm", "run", "dev" ]
```

### 2.2. `prometheus/prometheus.yml`

Este arquivo configura o Prometheus para coletar métricas da sua aplicação.

```yaml
global:
    scrape_interval: 15s

scrape_configs:
    - job_name: 'prometheus'
      static_configs:
          - targets: ['localhost:9090']

    - job_name: 'qurbiz-scraper'
      scrape_interval: 10s
      static_configs:
          - targets: ['qurbiz-scraper:3001'] # 'qurbiz-scraper' é o nome do serviço no docker-compose
```

### 2.3. Configuração de Provisionamento do Grafana

Crie os seguintes arquivos para que o Grafana seja provisionado automaticamente com a fonte de dados e o painel.

- **`grafana/provisioning/datasources/prometheus.yml`**: Configura o Prometheus como fonte de dados.
- **`grafana/provisioning/dashboards/dashboard.yml`**: Instrui o Grafana a carregar os painéis.
- **`grafana/dashboards/scraper-dashboard.json`**: Seu painel em formato JSON.

### 2.4. `docker-compose.yml`

Este é o arquivo principal que orquestra todos os serviços. Ele define as imagens, portas, volumes e dependências entre os contêineres. Consulte o `docker-compose.yml` na raiz do projeto para a configuração completa.

## Passo 3: Execução

Com todos os arquivos no lugar, inicie o ambiente com um único comando:

```bash
docker-compose up -d
```

Após a inicialização, os serviços estarão disponíveis:

- **Grafana:** `http://localhost:3000`
- **Prometheus:** `http://localhost:9090`
- **Endpoint de Métricas:** `http://localhost:3001/metrics`

O painel será carregado e configurado automaticamente no Grafana, pronto para uso.

```

Espero que este guia detalhado seja útil para você e para qualquer outra pessoa que venha a trabalhar no projeto!

<!--
[PROMPT_SUGGESTION]Atualize o README.md para incluir uma seção sobre as variáveis de ambiente necessárias.[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Crie um script para popular o banco de dados MongoDB dentro do contêiner Docker.[/PROMPT_SUGGESTION]
```
