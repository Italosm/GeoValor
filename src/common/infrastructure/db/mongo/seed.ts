import { createLogger } from '../../logger.js'
import { mongo } from './mongo.js'
import { providersCollection } from '../../../repositories/provider.repository.js'
import type { Provider } from '../../../repositories/provider.repository.js'

const logger = createLogger('seed:providers')

const providers: Omit<Provider, '_id' | 'nextScrapeAt' | 'lastScrapeAt'>[] = [
    {
        name: 'Barros Filhos Imóveis',
        slug: 'barros-filhos-imoveis',
        url: 'https://www.barrosfilhosimoveis.com.br',
        key: 'barros-filhos',
        scrapeIntervalMinutes: 60 * 24, // 24 hours
    },
    {
        name: 'Legislar Imobiliária',
        slug: 'legislar-imobiliaria',
        url: 'https://www.legislar.com.br',
        key: 'legislar',
        scrapeIntervalMinutes: 60 * 24, // 24 hours
    },
    {
        name: 'Cohab Premium',
        slug: 'cohab-premium',
        url: 'https://www.cohabpremium.com.br',
        key: 'cohab',
        scrapeIntervalMinutes: 60 * 24, // 24 hours
    },
]

async function seedProviders() {
    logger.info('Starting provider seed in MongoDB...')

    if (providers.length === 0) {
        logger.info('No providers to seed.')
        return
    }

    const operations = providers.map((provider) => ({
        updateOne: {
            filter: { key: provider.key },
            update: {
                $setOnInsert: {
                    ...provider,
                    lastScrapeAt: null,
                    nextScrapeAt: new Date(),
                },
            },
            upsert: true,
        },
    }))

    const result = await providersCollection.bulkWrite(operations)

    logger.info('Provider seed finished.')
    logger.info(`- ${result.upsertedCount} providers inserted.`)
    logger.info(`- ${result.matchedCount} providers already exist.`)
}

seedProviders()
    .catch((err) => logger.error({ err }, 'Error during provider seed.'))
    .finally(() => mongo.client.close())
