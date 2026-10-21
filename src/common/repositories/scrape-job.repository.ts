import type { ObjectId } from 'mongodb'
import { mongo } from '../infrastructure/db/mongo/mongo.js'

export enum ScrapeJobStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export interface ScrapeJob {
    _id?: ObjectId
    providerKey: string
    status: ScrapeJobStatus
    createdAt: Date
    metrics: {
        startTime?: Date
        endTime?: Date
        documentsCreated?: number
        documentsUpdated?: number
        urlsProcessed?: number
        urlsFailed?: number
        spyVersion?: string
    }
    reason?: string
}

export const scrapeJobsCollection =
    mongo.db.collection<ScrapeJob>('scrape_jobs')

scrapeJobsCollection.createIndex({ status: 1 }).catch((err) => {
    console.error('Error creating index for scrape_jobs', err)
})
