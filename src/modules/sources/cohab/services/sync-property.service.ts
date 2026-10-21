import type { Browser, Page } from 'playwright'
import { createLogger } from '../../../../common/infrastructure/logger.js'
import { saveFailedUrl } from '../../../../common/repositories/failed-url.repository.js'
import { saveRawCapture } from '../../../../common/repositories/raw-capture.repository.js'
import { reprocessFailedUrls } from '../../../../common/services/reprocess-failed-urls.service.js'
import { randomDelay } from '../../../../common/utils/delay.js'
import { logProgress } from '../../../../common/utils/progress.js'
import { LISTING_URLS, SPY_VERSION } from '../constants/urls.js'
import { scrapeListingData } from '../scrapers/listing.scraper.js'
import { scrapePropertyData } from '../scrapers/property.scraper.js'
import type { RawCohabListing } from '../types/listing.js'

const logger = createLogger('sync:cohab')

type Metrics = {
    documentsCreated: number
    documentsUpdated: number
    documentsUnchanged: number
    urlsProcessed: number
    urlsFailed: number
    spyVersion: string
}

async function waitForListingItems(page: Page): Promise<void> {
    await page.waitForSelector('.lista-imoveis .card-imo', {
        timeout: 30000,
    })
}

async function getPaginationUrls(page: Page): Promise<string[]> {
    const urls = await page
        .locator('.pagination a[href*="pag="]')
        .evaluateAll((links) => {
            return links
                .map((link) => link.getAttribute('href'))
                .filter((href): href is string => Boolean(href))
        })

    return [...new Set(urls.map((url) => new URL(url, page.url()).href))]
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
    const page = await browser.newPage()
    const scrapedProperties = new Map<string, RawCohabListing>()
    const failedListings: RawCohabListing[] = []

    try {
        for (const url of LISTING_URLS) {
            const pageUrlsToVisit = [url]
            const visitedPageUrls = new Set<string>()

            for (let index = 0; index < pageUrlsToVisit.length; index++) {
                const listingUrl = pageUrlsToVisit[index]

                if (!listingUrl || visitedPageUrls.has(listingUrl)) {
                    continue
                }

                visitedPageUrls.add(listingUrl)

                if (index > 0) {
                    await randomDelay(500, 1500)
                }

                logger.info({ url: listingUrl }, `Accessing listing page.`)

                await page.goto(listingUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                })

                await waitForListingItems(page)

                const listingsOnPage = await scrapeListingData(page)
                for (const listing of listingsOnPage) {
                    scrapedProperties.set(listing.externalId, listing)
                }

                const discoveredPageUrls = await getPaginationUrls(page)

                for (const discoveredPageUrl of discoveredPageUrls) {
                    if (!visitedPageUrls.has(discoveredPageUrl)) {
                        pageUrlsToVisit.push(discoveredPageUrl)
                    }
                }
            }
        }

        logger.info(`Total property URLs found: ${scrapedProperties.size}`)

        const listings = Array.from(scrapedProperties.values())

        if (listings.length > 0) {
            const detailPage = await browser.newPage()
            logger.info(`Processing ${listings.length} properties...`)
            const totalItems = listings.length
            const startTime = Date.now()
            let itemsProcessed = 0

            try {
                await detailPage.setExtraHTTPHeaders({
                    Referer:
                        LISTING_URLS[0] ?? 'https://www.cohabpremium.com.br/',
                })

                for (const listing of listings) {
                    const listingMeta = {
                        externalId: listing.externalId,
                        url: listing.url,
                    }
                    try {
                        const { property, rawHtml, retryable } =
                            await scrapePropertyData(detailPage, listing)

                        if (retryable) {
                            throw new Error(
                                `Retryable error, will be retried by the queue processor.`,
                            )
                        }

                        if (!property || !rawHtml) {
                            logger.warn(listingMeta, `No data extracted.`)
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
                            { ...listingMeta, error },
                            `Error processing property.`,
                        )
                        failedListings.push(listing)
                    } finally {
                        itemsProcessed++
                        logProgress(
                            itemsProcessed,
                            totalItems,
                            startTime,
                            logger,
                        )
                    }
                }
                if (failedListings.length > 0) {
                    logger.info(
                        `Saving ${failedListings.length} failed listings for later retry.`,
                    )
                    for (const failed of failedListings) {
                        await saveFailedUrl(
                            'cohab',
                            failed.url,
                            'Failed to process listing in main queue.',
                            3,
                        )
                    }
                }
            } finally {
                await detailPage.close()
            }
        }
    } catch (error) {
        logger.error({ error }, 'Fatal error during synchronization.')
    } finally {
        await page.close()
    }

    const urlToListingMap = new Map<string, RawCohabListing>()
    for (const listing of scrapedProperties.values()) {
        urlToListingMap.set(listing.url, listing)
    }

    await reprocessFailedUrls<RawCohabListing>(
        browser,
        'cohab',
        async (browser, listing) => {
            const page = await browser.newPage()
            await page.setExtraHTTPHeaders({
                Referer: LISTING_URLS[0] ?? 'https://www.cohabpremium.com.br/',
            })
            try {
                const { property, rawHtml } = await scrapePropertyData(
                    page,
                    listing,
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
            const map = new Map<string, RawCohabListing>()
            for (const url of urls) {
                const listing = urlToListingMap.get(url)
                if (listing) {
                    map.set(url, listing)
                }
            }
            return map
        },
    )

    metrics.urlsProcessed = scrapedProperties.size
    metrics.urlsFailed = failedListings.length
    logger.info('Synchronization finished.')
    return metrics
}
