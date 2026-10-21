---
name: apartment-ingestion
description: Use for scraping, mapping, and syncing apartment data in this project.
---

# Apartment Ingestion

Use this skill when you add or change a source under `src/modules/sources/*`, update a mapper, or adjust apartment sync flow.

## Default workflow
1. Identify the source module and keep source-specific code inside it.
2. Put extraction in `scrapers/`, transformation in `mappers/`, and orchestration in `services/`.
3. Reuse shared helpers from `src/common` for URLs, addresses, numbers, and persistence.
4. Update the source `types/` file when the input contract changes.
5. Add or refresh fixtures when selectors or page shape change.

## Guardrails
- Do not mix scraping, mapping, and persistence in one file unless the source is tiny.
- Treat `externalId` as the stable upsert key.
- Keep URL validation logic in shared services.
