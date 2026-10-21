# QUrbiz - Scraper & Agent Framework

Este projeto tem um duplo propósito:

1.  Coletar anúncios de imóveis de portais imobiliários (o "Scraper").
2.  Servir como um framework para desenvolver e gerenciar um sistema de Agentes de IA que mantêm e expandem o próprio projeto (o "Agent Framework").

O projeto é construído com uma forte filosofia de **convenção sobre configuração**, garantida por um sistema de verificação de integridade chamado "Harness".

## Arquitetura de Agentes e Skills

O núcleo da filosofia do projeto é sua arquitetura de agentes, definida em `.agents/manifest.json`. Este sistema modulariza as responsabilidades de desenvolvimento e manutenção em componentes de IA.

- **Agents (`.agents/agents/`):** Representam papéis de alto nível com responsabilidades-chave no projeto. Exemplos:
    - `repo-architect`: Guia decisões de arquitetura e fronteiras de módulos.
    - `scraper-engineer`: É dono do fluxo de scraping, seletores e mappers.
    - `data-steward`: Protege o esquema do banco de dados e a lógica de persistência.
- **Subagents (`.agents/subagents/`):** São especializações de um Agente principal, focados em tarefas mais específicas.
- **Skills (`skills/`):** Representam capacidades ou fluxos de trabalho que os agentes podem executar. Cada skill é autônoma e tem sua própria definição (`SKILL.md`) e configuração.

## O Sistema de "Harness"

Para garantir a integridade estrutural e o cumprimento das convenções, o projeto utiliza um "Harness".

O comando `pnpm run harness` valida vários aspectos do projeto, incluindo:

1.  A consistência do manifesto de agentes (`.agents/manifest.json`).
2.  A existência de arquivos e diretórios essenciais.
3.  A presença dos scripts necessários no `package.json`.

O comando `pnpm run check` é um superconjunto que executa o `harness` juntamente com `lint` e `typecheck`, servindo como a principal verificação de saúde do projeto.

## Comandos Principais

- `pnpm install`: Instala as dependências.
- `pnpm exec playwright install `: Instala os navegadores necessários.
- `pnpm run dev`: Inicia o agendador de scraping em modo de desenvolvimento.
- `pnpm run check`: Executa a suíte de verificação completa (lint, type-check, harness).
- `pnpm run harness`: Executa apenas a verificação de integridade da estrutura do projeto.
- `pnpm run mongo:seed`: Popula o banco de dados com os provedores iniciais.

## Executando com Docker Compose

Para simplificar a configuração e execução do ambiente completo (Aplicação, MongoDB, Prometheus e Grafana), você pode usar o Docker Compose.

### Pré-requisitos

- Docker e Docker Compose instalados em sua máquina.

### Estrutura de Diretórios

Antes de iniciar, certifique-se de que a seguinte estrutura de diretórios e arquivos exista na raiz do seu projeto:

```
.
├── grafana/
│   ├── dashboards/
│   │   └── scraper-dashboard.json  <-- Seu painel Grafana
│   └── provisioning/
│       ├── dashboards/
│       │   └── dashboard.yml
│       └── datasources/
│           └── prometheus.yml
├── prometheus/
│   └── prometheus.yml
├── Dockerfile
└── docker-compose.yml
```

### Iniciando os Serviços

Com a estrutura de diretórios pronta, execute o seguinte comando na raiz do projeto para construir as imagens e iniciar todos os contêineres em segundo plano:

```bash
docker-compose up -d
```

Após a inicialização, os serviços estarão disponíveis nos seguintes endereços:

- **Grafana:** `http://localhost:3000` (o painel será provisionado automaticamente)
- **Prometheus:** `http://localhost:9090`
- **Aplicação:** `http://localhost:3001` (endpoints `/health` e `/metrics`)

## Monitoramento e Alertas

O projeto é instrumentado com um sistema robusto de monitoramento e alertas para garantir sua saúde e performance em tempo real.

### Endpoints de Monitoramento

A aplicação expõe dois endpoints principais em uma porta dedicada (padrão: `3001`):

- **`GET /health`**: Retorna um JSON com o status atual de cada serviço supervisionado (`Scheduler` e `Worker Pool`), incluindo o número de reinicializações e o último erro que causou uma falha.
- **`GET /metrics`**: Expõe métricas no formato Prometheus, prontas para serem coletadas por um servidor Prometheus. As métricas incluem:
    - `service_restarts_total`: Total de reinicializações por serviço.
    - `jobs_processed_total`: Total de jobs processados, com labels para `provider` e `status`.
    - `job_duration_seconds`: Histograma da duração dos jobs.
    - `jobs_pending_total`: Número atual de jobs pendentes.
    - `jobs_running_total`: Número atual de jobs em execução.
    - `scrape_urls_failed_total`: Total de URLs que falharam durante o scraping.
    - `job_queue_duration_seconds`: Histograma do tempo que um job passa na fila.
    - `jobs_stale_removed_total`: Total de jobs obsoletos removidos.

### Painel Grafana e Alertas

O repositório inclui um painel Grafana pré-configurado (`grafana-dashboard.json`) que pode ser importado para visualizar todas as métricas coletadas.

O painel vem com as seguintes regras de alerta pré-configuradas:

1.  **`High Failed URL Rate`**: Dispara se a taxa de URLs com falha para qualquer provedor exceder um limite por 5 minutos. Isso pode indicar um problema com os seletores do scraper ou uma mudança no site de origem.
2.  **`High Average Job Duration`**: Dispara se a duração média de um job exceder 5 minutos. Isso pode indicar lentidão no site de origem ou um problema de performance no scraper.
3.  **`High Average Queue Duration`**: Dispara se o tempo médio que um job passa na fila exceder 1 minuto. Isso geralmente indica que o pool de workers está sobrecarregado e pode ser necessário aumentar o `MAX_CONCURRENT_JOBS`.
4.  **`High Stale Job Removal Rate`**: Dispara se a taxa de remoção de jobs obsoletos for consistentemente alta. Isso pode indicar que os workers estão travando ou sendo encerrados de forma anormal, deixando jobs no estado `PENDING` por muito tempo.

**Para receber as notificações**, é necessário configurar um "Canal de Notificação" (Notification Channel) na sua instância do Grafana (ex: E-mail, Slack, Discord) e associá-lo a essas regras de alerta.

## A Aplicação de Scraping

A funcionalidade de scraping coleta dados de portais, os normaliza e armazena.

### Tecnologias

- Node.js, TypeScript, PNPM
- Playwright para web scraping
- **Pino** para logging estruturado
- **Zod** para validação de esquemas e tipos
- Driver `mongodb` para armazenamento de dados brutos

### Fluxo de Execução

O ponto de entrada é `src/common/infrastructure/http/server.ts`. Este arquivo inicia e orquestra dois processos principais que rodam em paralelo: um **Agendador de Tarefas (Scheduler)** e um **Processador de Tarefas (Worker)**.

Essa arquitetura desacoplada permite que a criação de tarefas de scraping seja independente da sua execução, aumentando a robustez e a escalabilidade do sistema.

#### 1. O Agendador (Scheduler)

A função `scheduleJobsPeriodically` é responsável por popular a fila de trabalhos.

- **Verificação Periódica:** Em um loop contínuo (a cada 1 minuto por padrão), o agendador consulta o banco de dados por provedores (`sources`) que precisam ser processados (cujo `nextScrapeAt` já passou ou é nulo).
- **Criação de Tarefas (Jobs):** Para cada provedor encontrado, ele cria um novo documento `ScrapeJob` no MongoDB com o status `PENDING`.
- **Gerenciamento de Jobs Antigos:** Antes de criar um novo job, o agendador verifica se já existe um job `PENDING` para o mesmo provedor que está "preso" por muito tempo (mais de 5 minutos, por padrão). Se encontrar, ele o remove para permitir que um novo seja criado e processado.
- **Prevenção de Duplicidade:** O agendador não cria um novo job se já existir um com status `PENDING` (recente) ou `RUNNING` para o mesmo provedor, evitando trabalho duplicado.

#### 2. O Processador de Tarefas (Worker)

A função `listenForScrapeJobs` é responsável por executar os trabalhos de scraping.

- **Pool de Concorrência:** O worker gerencia um número limitado de jobs concorrentes (definido por `MAX_CONCURRENT_JOBS`), garantindo que o sistema não sobrecarregue os recursos da máquina ou os portais de destino.
- **Consumo da Fila:** Ele continuamente busca por jobs com status `PENDING` no banco de dados.
- **Ciclo de Vida de um Job:**
    1.  Quando um worker livre encontra um job `PENDING`, ele o assume.
    2.  O status do job é imediatamente atualizado para `RUNNING` para que outros workers não o peguem.
    3.  Uma nova instância do Playwright (navegador) é criada exclusivamente para este job.
    4.  O serviço `runSingleScraper` é invocado, executando a lógica de scraping para o provedor específico.
    5.  Ao final (sucesso ou falha), a função `processJob` do worker atualiza o status do job para `COMPLETED` ou `FAILED`.
    6.  A instância do Playwright é fechada.
    7.  O worker fica livre para processar o próximo job da fila.
- **Reatividade:** O worker também "escuta" por novas inserções na coleção de jobs. Assim que um novo job é criado pelo agendador, o worker é notificado e tenta processá-lo imediatamente se houver capacidade no pool.

### Fluxo de Dados

1.  O scraper de listagem de um provedor coleta URLs de anúncios.
2.  O scraper de detalhe extrai os dados brutos de cada anúncio (HTML/JSON).
3.  Um `mapper` transforma os dados brutos em um formato padronizado (`ScrapedProperty`).
4.  A **captura bruta (`raw_capture`)** é salva no MongoDB, contendo tanto o HTML/JSON original quanto os dados mapeados. Este registro é criado a cada execução bem-sucedida do scraper.
5.  Um **snapshot (`raw_snapshot`)** é criado no MongoDB apenas se o `snapshotHash` do anúncio atual for diferente do `snapshotHash` da última captura para o mesmo imóvel. Isso garante um histórico apenas com as alterações relevantes.

### Estratégia de Hashing

O sistema usa dois hashes distintos para gerenciar os dados:

- **`snapshotHash`**: Calculado a partir de um conjunto amplo de campos de negócio (preço, área, título, descrição, endereço, etc.). Seu objetivo é detectar **mudanças em um anúncio ao longo do tempo** para criar um histórico de versões (`raw_snapshots`).
- **`hashDeduplication`**: Calculado a partir de um conjunto restrito e estável de atributos (área, quartos, banheiros, tipo, endereço normalizado). Seu objetivo é criar uma "impressão digital" para **identificar se anúncios diferentes são o mesmo imóvel físico**, permitindo a desduplicação.

### Provedores Atuais

- Barros Filhos
- Legislar
- COHAB Premium
