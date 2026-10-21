import type { Browser, Page } from 'playwright'
import { createLogger } from '../../../../common/infrastructure/logger.js'
import { saveFailedUrl } from '../../../../common/repositories/failed-url.repository.js'
import { saveRawCapture } from '../../../../common/repositories/raw-capture.repository.js'
import { reprocessFailedUrls } from '../../../../common/services/reprocess-failed-urls.service.js'
import { logProgress } from '../../../../common/utils/progress.js'
import { LISTING_URLS, SPY_VERSION } from '../constants/urls.js'
import { scrapeListingData } from '../scrapers/listing.scraper.js'
import { scrapePropertyData } from '../scrapers/property.scraper.js'
import type { RawLegislarListing } from '../types/listing.js'

const logger = createLogger('sync:legislar')

type Metrics = {
    documentsCreated: number
    documentsUpdated: number
    documentsUnchanged: number
    urlsProcessed: number
    urlsFailed: number
    spyVersion: string
}

async function getPaginationPageNumbers(page: Page): Promise<string[]> {
    return page
        .locator('#dadosimoveis .pagination a[data-page]')
        .evaluateAll((links) => {
            return links
                .map((link) => link.getAttribute('data-page'))
                .filter((value): value is string => Boolean(value))
        })
        .then((pageNumbers) => [...new Set(pageNumbers)])
}

async function waitForListingItems(page: Page): Promise<void> {
    await page.waitForSelector('#dadosimoveis .listing-item', {
        timeout: 45000,
    })
}

async function processCurrentPage(page: Page): Promise<RawLegislarListing[]> {
    const listings = await scrapeListingData(page)
    logger.info(`Properties found on current page: ${listings.length}`)
    return listings
}

async function goToListingPage(page: Page, pageNumber: string): Promise<void> {
    // nunca alterar para .click() pois não funciona. Evaluate é necessário para disparar o evento de click corretamente.
    await page
        .locator(`#dadosimoveis .pagination a[data-page="${pageNumber}"]`)
        .first()
        .evaluate((link: HTMLElement) => link.click())

    await page.waitForFunction(
        (pageNumber) => {
            const activePage = document
                .querySelector('#dadosimoveis .pagination .active')
                ?.textContent?.trim()

            return activePage === pageNumber
        },
        pageNumber,
        {
            timeout: 45000,
        },
    )

    await waitForListingItems(page)
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
    const scrapedProperties = new Map<string, RawLegislarListing>()
    const failedListings: RawLegislarListing[] = []

    try {
        for (const url of LISTING_URLS) {
            logger.info({ url }, `Accessing listing page.`)

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 90000,
            })

            await waitForListingItems(page)

            const pageNumbersToVisit = await getPaginationPageNumbers(page)
            const visitedPageNumbers = new Set(['1'])
            const listings = await processCurrentPage(page)

            for (const listing of listings) {
                scrapedProperties.set(listing.externalId, listing)
            }

            for (let index = 0; index < pageNumbersToVisit.length; index++) {
                const pageNumber = pageNumbersToVisit[index]

                if (!pageNumber || visitedPageNumbers.has(pageNumber)) {
                    continue
                }

                visitedPageNumbers.add(pageNumber)

                logger.info({ page: pageNumber }, `Accessing page number.`)

                await goToListingPage(page, pageNumber)

                const listings = await processCurrentPage(page)
                const discoveredPageNumbers =
                    await getPaginationPageNumbers(page)

                for (const listing of listings) {
                    scrapedProperties.set(listing.externalId, listing)
                }

                for (const discoveredPageNumber of discoveredPageNumbers) {
                    if (!visitedPageNumbers.has(discoveredPageNumber)) {
                        pageNumbersToVisit.push(discoveredPageNumber)
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
                            'legislar',
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
    } finally {
        await page.close()
    }

    const urlToListingMap = new Map<string, RawLegislarListing>()
    for (const listing of scrapedProperties.values()) {
        urlToListingMap.set(listing.url, listing)
    }

    await reprocessFailedUrls<RawLegislarListing>(
        browser,
        'legislar',
        async (browser, listing) => {
            const page = await browser.newPage()
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
            const map = new Map<string, RawLegislarListing>()
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
