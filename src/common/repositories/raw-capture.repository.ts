import { createHash } from 'node:crypto'
import type { ObjectId } from 'mongodb'
import { mongo } from '../infrastructure/db/mongo/mongo.js'
import { createLogger } from '../infrastructure/logger.js'
import type { ScrapedProperty } from '../types/scraper.js'
import { normalize } from '../utils/normalize.js'
const logger = createLogger('repository:raw-capture')

export const rawCapturesCollection = mongo.db.collection<RawCapture>('raw_captures')
export const rawSnapshotsCollection = mongo.db.collection('raw_snapshots')

export interface RawCapture {
    _id?: ObjectId
    sourceProvider: string
    externalAdId: string
    metadata: {
        sourceProvider: string
        externalAdId: string
        sourceUrl: string
        captureDate: Date
        spiderVersion: string
    }
    processingControl: {
        status: 'pending'
        processingAttempts: number
        lastProcessingDate: Date | null
        errorLog: string | null
    }
    payload: {
        extractionType: 'html_scraping' | 'api_json' | 'hybrid'
        jsonData: ScrapedProperty
        rawHtml: string
    }
    deduplicationHash: string
    snapshotHash: string
    lastSnapshotHash: string
    firstSeenAt: Date
    lastSeenAt: Date
}

/**
 * Function to create the deduplication hash based on normalized data
 */
function buildDeduplicationHash(data: ScrapedProperty): string {
    const areaForHash = data.areaUseful ?? data.areaTotal ?? null
    const hashPayload = {
        areaUseful: areaForHash,
        garages: data.garages ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        address: data.address
            ? {
                  address: normalize(data.address.address) ?? null,
                  cep: normalize(data.address.cep) ?? null,
                  neighborhood: normalize(data.address.neighborhood) ?? null,
                  city: normalize(data.address.city) ?? null,
                  state: normalize(data.address.state) ?? null,
              }
            : null,
    }

    return createHash('sha256')
        .update(JSON.stringify(hashPayload))
        .digest('hex')
}

function getSnapshotHashPayload(data: ScrapedProperty) {
    const normalizeNumber = (
        value: number | null | undefined,
    ): string | null => {
        if (value === null || value === undefined) {
            return null
        }
        return value.toFixed(4)
    }
    return {
        price: normalizeNumber(data.priceCents),
        condoPrice: normalizeNumber(data.condominiumFeeCents),
        iptu: normalizeNumber(data.iptuCents),
        areaUseful: normalizeNumber(data.areaUseful),
        areaTotal: normalizeNumber(data.areaTotal),
        garages: normalizeNumber(data.garages),
        bedrooms: normalizeNumber(data.bedrooms),
        bathrooms: normalizeNumber(data.bathrooms),
        title: data.title ? normalize(data.title) : null,
        description: data.description ? normalize(data.description) : null,
        address: data.address
            ? {
                  address: data.address.address
                      ? normalize(data.address.address)
                      : null,
                  cep: data.address.cep ? normalize(data.address.cep) : null,
                  neighborhood: data.address.neighborhood
                      ? normalize(data.address.neighborhood)
                      : null,
                  city: data.address.city ? normalize(data.address.city) : null,
                  state: data.address.state
                      ? normalize(data.address.state)
                      : null,
              }
            : null,
        features: data.features ? data.features.map((f) => normalize(f)) : null,
    }
}

/**
 * Function to create the snapshot hash based on relevant ad data.
 * This hash is used to detect changes in an ad over time.
 */
function buildSnapshotHash(data: ScrapedProperty): string {
    const hashPayload = getSnapshotHashPayload(data)
    return createHash('sha256')
        .update(JSON.stringify(hashPayload))
        .digest('hex')
}

function buildSnapshotPayload(
    data: ScrapedProperty,
    rawHtml: string,
): RawCapture['payload'] {
    return {
        extractionType: 'html_scraping',
        jsonData: data,
        rawHtml: rawHtml,
    }
}

export type SaveResult = {
    created?: boolean
    updated?: boolean
    unchanged?: boolean
}

export async function saveRawCapture(
    mappedData: ScrapedProperty,
    rawHtml: string,
    spyVersion: string,
): Promise<SaveResult> {
    const adIdentifier = {
        provider: mappedData.provider,
        externalId: mappedData.externalId,
    }
    try {
        const now = new Date()
        const deduplicationHash = buildDeduplicationHash(mappedData)
        const snapshotHash = buildSnapshotHash(mappedData)
        const payload = buildSnapshotPayload(mappedData, rawHtml)
        const filter = {
            sourceProvider: mappedData.provider,
            externalAdId: mappedData.externalId,
        }

        const existingCapture = await rawCapturesCollection.findOneAndUpdate(
            filter,
            {
                $set: {
                    lastSeenAt: now,
                    'metadata.sourceUrl': mappedData.url,
                    'metadata.captureDate': now,
                    payload,
                    deduplicationHash: deduplicationHash,
                },
                $setOnInsert: {
                    sourceProvider: mappedData.provider,
                    externalAdId: mappedData.externalId,
                    'metadata.sourceProvider': mappedData.provider,
                    'metadata.externalAdId': mappedData.externalId,
                    'metadata.spiderVersion': spyVersion,
                    processingControl: {
                        status: 'pending',
                        processingAttempts: 0,
                        lastProcessingDate: null,
                        errorLog: null,
                    },
                    snapshotHash,
                    lastSnapshotHash: snapshotHash,
                    firstSeenAt: now,
                },
            },
            { upsert: true, returnDocument: 'before' },
        )

        if (!existingCapture) {
            logger.info({ adIdentifier }, `New raw capture created.`)
            await rawSnapshotsCollection.insertOne({
                provider: mappedData.provider,
                externalId: mappedData.externalId,
                url: mappedData.url,
                spyVersion,
                snapshotHash,
                deduplicationHash: deduplicationHash,
                payload,
                createdAt: now,
            })
            return { created: true }
        }

        const previousSnapshotHash = existingCapture.snapshotHash

        if (previousSnapshotHash === snapshotHash) {
            logger.debug(
                { adIdentifier },
                `Skipping snapshot as hash is unchanged.`,
            )
            return { unchanged: true }
        }

        logger.info({ adIdentifier }, `Change detected. Creating new snapshot.`)
        const updateRes = await rawCapturesCollection.updateOne(
            {
                _id: existingCapture._id,
                snapshotHash: previousSnapshotHash,
            },
            {
                $set: {
                    snapshotHash,
                    lastSnapshotHash: snapshotHash,
                },
            },
        )

        if (updateRes.modifiedCount > 0) {
            await rawSnapshotsCollection.insertOne({
                provider: mappedData.provider,
                externalId: mappedData.externalId,
                url: mappedData.url,
                spyVersion,
                snapshotHash,
                deduplicationHash: deduplicationHash,
                payload,
                createdAt: now,
            })
            logger.info({ adIdentifier }, `Successfully created new snapshot.`)
            return { updated: true }
        } else {
            logger.warn(
                { adIdentifier },
                `Snapshot creation skipped (race condition avoided).`,
            )
            return { unchanged: true }
        }
    } catch (error) {
        logger.error(
            { adIdentifier, error },
            `Error saving raw capture to MongoDB`,
        )
        throw error
    }
}

export async function findMostRecentRawCapture(
    url: string,
): Promise<RawCapture | null> {
    const result = await rawCapturesCollection
        .find({ 'metadata.sourceUrl': url })
        .sort({ 'metadata.captureDate': -1 })
        .limit(1)
        .toArray()

    return result[0] ?? null
}
