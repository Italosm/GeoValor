import type { ObjectId } from 'mongodb'
import { mongo } from '../infrastructure/db/mongo/mongo.js'
import { createLogger } from '../infrastructure/logger.js'

const logger = createLogger('repository:failed-url')

export enum FailedUrlStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

export interface FailedUrl {
    _id?: ObjectId
    provider: string
    url: string
    errorReason: string
    initialAttempts: number
    reprocessingAttempts: number
    status: FailedUrlStatus
    failedAt: Date
    lastScrapeAt: Date
    nextScrapeAt: Date
    scrapeIntervalMinutes: number
}

export const failedUrlsCollection =
    mongo.db.collection<FailedUrl>('failed_urls')

const DEFAULT_REPROCESSING_INTERVAL_MINUTES = 2 * 24 * 60 // 2 days

export async function saveFailedUrl(
    provider: string,
    url: string,
    reason: string,
    initialAttempts: number,
    scrapeIntervalMinutes: number = DEFAULT_REPROCESSING_INTERVAL_MINUTES,
): Promise<void> {
    try {
        const now = new Date()
        const nextScrapeAt = new Date(
            now.getTime() + scrapeIntervalMinutes * 60 * 1000,
        )

        await failedUrlsCollection.updateOne(
            { provider, url },
            {
                $setOnInsert: {
                    provider,
                    url,
                    failedAt: now,
                },
                $set: {
                    errorReason: reason,
                    initialAttempts,
                    reprocessingAttempts: 0,
                    status: FailedUrlStatus.ACTIVE,
                    lastScrapeAt: now,
                    nextScrapeAt,
                    scrapeIntervalMinutes,
                },
            },
            { upsert: true },
        )
        logger.warn(
            { provider, url },
            'Saved/Updated failed URL for later processing.',
        )
    } catch (error) {
        logger.error({ provider, url, error }, 'Failed to save failed URL.')
    }
}

export async function getFailedUrlsByProvider(
    provider: string,
): Promise<FailedUrl[]> {
    return failedUrlsCollection.find({ provider }).toArray()
}

export async function getActiveFailedUrlsByProvider(
    provider: string,
): Promise<FailedUrl[]> {
    const now = new Date()
    return failedUrlsCollection
        .find({
            provider,
            status: FailedUrlStatus.ACTIVE,
            nextScrapeAt: { $lte: now },
        })
        .toArray()
}

export async function updateFailedUrl(
    id: ObjectId,
    updates: Partial<Omit<FailedUrl, '_id'>>,
): Promise<void> {
    await failedUrlsCollection.updateOne({ _id: id }, { $set: updates })
}

export async function deleteFailedUrl(id: ObjectId): Promise<void> {
    await failedUrlsCollection.deleteOne({ _id: id })
}

export async function incrementFailedUrlAttempt(
    id: ObjectId,
    reason: string,
    scrapeIntervalMinutes: number = DEFAULT_REPROCESSING_INTERVAL_MINUTES,
): Promise<void> {
    try {
        const now = new Date()
        const nextScrapeAt = new Date(
            now.getTime() + scrapeIntervalMinutes * 60 * 1000,
        )

        await failedUrlsCollection.updateOne(
            { _id: id },
            {
                $inc: { reprocessingAttempts: 1 },
                $set: {
                    errorReason: reason,
                    lastScrapeAt: now,
                    nextScrapeAt,
                },
            },
        )
    } catch (error) {
        logger.error({ id, error }, 'Failed to increment failed URL attempt.')
    }
}

export async function deactivateFailedUrl(
    id: ObjectId,
    reason: string,
): Promise<void> {
    try {
        await failedUrlsCollection.updateOne(
            { _id: id },
            {
                $set: {
                    status: FailedUrlStatus.INACTIVE,
                    errorReason: reason,
                    lastScrapeAt: new Date(),
                },
            },
        )
        logger.warn({ id }, 'Deactivated failed URL after multiple retries.')
    } catch (error) {
        logger.error({ id, error }, 'Failed to deactivate failed URL.')
    }
}
