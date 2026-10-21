import type { Browser, Page } from 'playwright'
import { createLogger } from '../../../../common/infrastructure/logger.js'
import { saveFailedUrl } from '../../../../common/repositories/failed-url.repository.js'
import { saveRawCapture } from '../../../../common/repositories/raw-capture.repository.js'
import { reprocessFailedUrls } from '../../../../common/services/reprocess-failed-urls.service.js'
import { randomDelay } from '../../../../common/utils/delay.js'
import { LISTING_URLS, SPY_VERSION } from '../constants/urls.js'
import { scrapeListingLinks } from '../scrapers/listings.scraper.js'
import { scrapePropertyData } from '../scrapers/property.scraper.js'
import { logProgress } from '../../../../common/utils/progress.js'

const logger = createLogger('sync:barros-filhos')

type Metrics = {
    documentsCreated: number
    documentsUpdated: number
    documentsUnchanged: number
    urlsProcessed: number
    urlsFailed: number
    spyVersion: string
}

async function getAllListingLinks(page: Page): Promise<string[]> {
    const allLinks = new Set<string>()

    for (const url of LISTING_URLS) {
        logger.info({ url }, `Accessing listing page.`)
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
            await page.waitForSelector(
                '#resultsData, #buscaInteligenteContainer',
                {
                    timeout: 30000,
                },
            )
        } catch (error) {
            logger.error({ url, error }, `Error accessing listing page.`)
            continue
        }

        logger.info(`Scrolling page to load all properties...`)

        const linksOnPage = new Set<string>()
        let noNewLinksCount = 0
        const maxScrolls = 30

        for (let i = 0; i < maxScrolls && noNewLinksCount < 3; i++) {
            const currentLinks = await scrapeListingLinks(page)
            const previousSize = linksOnPage.size

            for (const link of currentLinks) {
                linksOnPage.add(link)
            }

            if (linksOnPage.size === previousSize) {
                noNewLinksCount++
            } else {
                noNewLinksCount = 0
            }

            await page.mouse.wheel(0, 2400)
            await randomDelay(500, 1000)
        }

        linksOnPage.forEach((link) => allLinks.add(link))
    }

    return [...allLinks]
}

export async function syncProperties(browser: Browser): Promise<Metrics> {
    const metrics: Metrics = {
        documentsCreated: 0,
        documentsUpdated: 0,
        documentsUnchanged: 0,
        urlsProcessed: 0,
        urlsFailed: 0,
        spyVersion: SPY_VERSION,
    }
    logger.info('Starting synchronization...')
    const listPage = await browser.newPage()
    let listings: string[]
    try {
        listings = await getAllListingLinks(listPage)
        logger.info(`Total property URLs found: ${listings.length}`)
    } finally {
        await listPage.close()
    }

    if (listings.length === 0) {
        logger.info('No properties to process.')
        return metrics
    }

    const failedListings: string[] = []
    const propertyPage = await browser.newPage()
    try {
        await propertyPage.setExtraHTTPHeaders({
            Referer:
                LISTING_URLS[0] ?? 'https://www.barrosfilhosimoveis.com.br/',
        })

        const totalItems = listings.length
        logger.info(`Processing ${totalItems} properties...`)
        const startTime = Date.now()
        let itemsProcessed = 0

        for (const listingUrl of listings) {
            await randomDelay(1000, 2500)

            try {
                const { property, rawHtml, retryable } =
                    await scrapePropertyData(propertyPage, listingUrl)

                if (retryable) {
                    throw new Error(
                        `Retryable error, will be retried by the queue processor.`,
                    )
                }

                if (!property || !rawHtml) {
                    logger.warn({ url: listingUrl }, `No data extracted.`)
                    continue
                }

                const result = await saveRawCapture(
                    property,
                    rawHtml,
                    SPY_VERSION,
                )
                if (result.created) metrics.documentsCreated++
                if (result.updated) metrics.documentsUpdated++
                if (result.unchanged) metrics.documentsUnchanged++
            } catch (error) {
                logger.error(
                    { url: listingUrl, error },
                    `Error processing property.`,
                )
                failedListings.push(listingUrl)
            } finally {
                itemsProcessed++
                logProgress(itemsProcessed, totalItems, startTime, logger)
            }
        }

        if (failedListings.length > 0) {
            logger.info(
                `Saving ${failedListings.length} failed listings for later retry.`,
            )
            for (const failed of failedListings) {
                await saveFailedUrl(
                    'barros-filhos',
                    failed,
                    'Failed to process listing in main queue.',
                    3,
                )
            }
        }
    } finally {
        await propertyPage.close()
    }

    await reprocessFailedUrls<string>(
        browser,
        'barros-filhos',
        async (browser, url) => {
            const page = await browser.newPage()
            await page.setExtraHTTPHeaders({
                Referer:
                    LISTING_URLS[0] ??
                    'https://www.barrosfilhosimoveis.com.br/',
            })
            await randomDelay(1000, 2500)
            try {
                const { property, rawHtml } = await scrapePropertyData(
                    page,
                    url,
                )
                if (!property || !rawHtml) {
                    throw new Error('Failed to scrape property data.')
                }
                const result = await saveRawCapture(
                    property,
                    rawHtml,
                    SPY_VERSION,
                )
                if (result.created) metrics.documentsCreated++
                if (result.updated) metrics.documentsUpdated++
                if (result.unchanged) metrics.documentsUnchanged++
                return { success: true }
            } catch (error) {
                return { success: false, error }
            } finally {
                await page.close()
            }
        },
        async (urls) => {
            const map = new Map<string, string>()
            for (const url of urls) {
                map.set(url, url)
            }
            return map
        },
    )

    metrics.urlsProcessed = listings.length
    metrics.urlsFailed = failedListings.length
    logger.info('Synchronization finished.')
    return metrics
}

