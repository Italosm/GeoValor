import type { Browser } from 'playwright'
import { createLogger } from '../infrastructure/logger.js'
import {
    deactivateFailedUrl,
    deleteFailedUrl,
    getActiveFailedUrlsByProvider,
    incrementFailedUrlAttempt,
} from '../repositories/failed-url.repository.js'
import { findMostRecentRawCapture } from '../repositories/raw-capture.repository.js'
import { processQueue } from './queue.processor.js'

const logger = createLogger('service:reprocess-failed-urls')

const MAX_RETRY_ATTEMPTS = 5

type ScrapeResult = {
    success: boolean
    error?: unknown
}

export async function reprocessFailedUrls<T>(
    browser: Browser,
    provider: string,
    scrapeItem: (browser: Browser, item: T) => Promise<ScrapeResult>,
    getItemsForUrls: (urls: string[]) => Promise<Map<string, T>>,
): Promise<void> {
    const failedUrls = await getActiveFailedUrlsByProvider(provider)

    if (failedUrls.length === 0) {
        logger.info(`No failed URLs to reprocess for provider: ${provider}`)
        return
    }

    logger.info(
        `Reprocessing ${failedUrls.length} failed URLs for provider: ${provider}`,
    )

    const itemsToReprocess = await getItemsForUrls(
        failedUrls.map((f) => f.url),
    )

    const processUrl = async (url: string): Promise<void> => {
        const failedUrl = failedUrls.find((f) => f.url === url)
        if (!failedUrl) {
            logger.error({ url }, 'Could not find failed URL entry.')
            return
        }

        if (failedUrl.reprocessingAttempts >= MAX_RETRY_ATTEMPTS) {
            await deactivateFailedUrl(
                failedUrl._id!,
                `Deactivated after ${MAX_RETRY_ATTEMPTS} attempts.`,
            )
            return
        }

        const recentCapture = await findMostRecentRawCapture(url)
        if (recentCapture && recentCapture.metadata.captureDate > failedUrl.failedAt) {
            logger.info(
                { url },
                'URL has a recent successful capture. Removing from failed list.',
            )
            await deleteFailedUrl(failedUrl._id!)
            return
        }

        const item = itemsToReprocess.get(url)
        if (!item) {
            await incrementFailedUrlAttempt(
                failedUrl._id!,
                'Could not find original item data for reprocessing.',
            )
            logger.error({ url }, 'Could not find original item data.')
            return
        }

        try {
            const result = await scrapeItem(browser, item)

            if (result.success) {
                logger.info({ url }, 'Successfully reprocessed URL.')
                await deleteFailedUrl(failedUrl._id!)
            } else {
                logger.warn({ url, error: result.error }, 'Reprocessing failed.')
                await incrementFailedUrlAttempt(
                    failedUrl._id!,
                    'Reprocessing failed.',
                )
            }
        } catch (error) {
            logger.error({ url, error }, 'Error during reprocessing.')
            await incrementFailedUrlAttempt(
                failedUrl._id!,
                'Reprocessing failed with an exception.',
            )
        }
    }

    const queueItems = failedUrls.map((u) => u.url)

    await processQueue(
        queueItems,
        (url) => processUrl(url),
        `${provider}-reprocessing`,
        {
            concurrency: 1,
            retries: 0, // Retries are handled by the service itself
        },
    )
}
