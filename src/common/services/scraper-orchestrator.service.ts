import type { Browser } from 'playwright'
import type { ObjectId } from 'mongodb'
import { createLogger } from '../infrastructure/logger.js'
import { syncProperties as syncBarrosFilhosProperties } from '../../modules/sources/barros-filhos/services/sync-property.service.js'
import { syncProperties as syncCohabProperties } from '../../modules/sources/cohab/services/sync-property.service.js'
import { syncProperties as syncLegislarProperties } from '../../modules/sources/legislar/services/sync-property.service.js'
import { providersCollection } from '../repositories/provider.repository.js'
import { delay } from '../utils/delay.js'

const logger = createLogger('orchestrator')

const SCRAPER_RETRIES = 3
const SCRAPER_RETRY_DELAY_MS = 5000

export type Metrics = {
    documentsCreated: number
    documentsUpdated: number
    documentsUnchanged: number
    urlsProcessed: number
    urlsFailed: number
    spyVersion?: string
}

const scraperMap: Record<string, (browser: Browser) => Promise<Metrics>> = {
    'barros-filhos': syncBarrosFilhosProperties,
    legislar: syncLegislarProperties,
    cohab: syncCohabProperties,
}

export async function runSingleScraper(
    providerKey: string,
    browser: Browser,
    jobId: ObjectId,
): Promise<Metrics> {
    const provider = await providersCollection.findOne({ key: providerKey })
    if (!provider) {
        logger.warn({ providerKey, jobId }, `Provider not found for scraping.`)
        throw new Error(`Provider not found: ${providerKey}`)
    }

    const scraperFn = scraperMap[provider.key]
    const providerMeta = {
        providerName: provider.name,
        providerKey: provider.key,
        jobId,
    }

    if (!scraperFn) {
        logger.warn(providerMeta, `No scraper function found for provider.`)
        throw new Error(
            `Scraper function not found for provider: ${providerKey}`,
        )
    }

    for (let attempt = 1; attempt <= SCRAPER_RETRIES; attempt++) {
        try {
            logger.info(
                { ...providerMeta, attempt },
                `Starting scraper for provider.`,
            )
            const metrics = await scraperFn(browser)

            await providersCollection.updateOne(
                { _id: provider._id },
                {
                    $set: {
                        lastScrapeAt: new Date(),
                        nextScrapeAt: new Date(
                            Date.now() +
                                provider.scrapeIntervalMinutes * 60 * 1000,
                        ),
                    },
                },
            )
            logger.info(providerMeta, `Scraper finished successfully.`)

            return metrics
        } catch (error) {
            const isLastAttempt = attempt === SCRAPER_RETRIES
            logger.error(
                { ...providerMeta, error, attempt },
                `Error executing scraper for provider.`,
            )
            if (isLastAttempt) {
                logger.fatal(
                    { ...providerMeta, error },
                    `Scraper failed after ${SCRAPER_RETRIES} attempts. Propagating error.`,
                )
                throw error
            } else {
                logger.info(`Retrying in ${SCRAPER_RETRY_DELAY_MS / 1000}s...`)
                await delay(SCRAPER_RETRY_DELAY_MS)
            }
        }
    }

    throw new Error('Scraper failed after all retries.')
}
