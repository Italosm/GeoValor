import { createLogger } from '../infrastructure/logger.js'
import { logProgress } from '../utils/progress.js'

import { delay } from '../utils/delay.js'

export interface ProcessQueueOptions {
    concurrency?: number

    retries?: number

    retryDelay?: number
}

type QueueItem<T> = {
    data: T

    attempts: number
}

export interface FailedQueueItem<T> {
    item: T
    error: Error
}

export async function processQueue<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    source: string,
    options: ProcessQueueOptions = {},
): Promise<FailedQueueItem<T>[]> {
    const { concurrency = 1, retries = 3, retryDelay = 2000 } = options

    const logger = createLogger(`queue:${source}`)

    logger.debug(`Initializing queue for source: ${source}`)

    const queue: QueueItem<T>[] = items.map((data) => ({ data, attempts: 0 }))

    const failedItems: FailedQueueItem<T>[] = []

    let itemsProcessed = 0

    const totalItems = items.length

    const startTime = Date.now()

    if (totalItems === 0) {
        logger.info('No items to process.')

        return []
    }

    logger.info(
        `Starting processing of ${totalItems} items with concurrency ${concurrency}.`,
    )

    const worker = async () => {
        while (queue.length > 0) {
            const item = queue.shift()

            if (!item) continue

            try {
                await processor(item.data)

                itemsProcessed++

                logProgress(itemsProcessed, totalItems, startTime, logger)
            } catch (error) {
                item.attempts++

                const logContext = {
                    item: item.data,

                    error:
                        error instanceof Error ? error.message : String(error),

                    attempt: item.attempts,
                }

                if (item.attempts >= retries) {
                    logger.error(
                        logContext,

                        `Item failed permanently after ${retries} retries.`,
                    )

                    failedItems.push({
                        item: item.data,
                        error: error as Error,
                    })

                    itemsProcessed++ // Count as processed even if failed

                    logProgress(itemsProcessed, totalItems, startTime, logger)
                } else {
                    logger.warn(
                        logContext,

                        `Item failed. Re-queuing for another attempt.`,
                    )

                    // Push to the back of the queue and wait before this worker picks up a new task

                    queue.push(item)

                    await delay(retryDelay)
                }
            }
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, totalItems) },

        () => worker(),
    )

    await Promise.all(workers)

    logger.info('All items have been processed.')

    if (failedItems.length > 0) {
        logger.warn(
            `${failedItems.length} items failed permanently and will be returned.`,
        )
    }

    return failedItems
}
