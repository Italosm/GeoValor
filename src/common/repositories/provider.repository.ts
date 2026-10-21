import type { ObjectId } from 'mongodb'
import { mongo } from '../infrastructure/db/mongo/mongo.js'

export const providersCollection = mongo.db.collection('providers')

export interface Provider {
    _id?: ObjectId
    name: string
    slug: string
    url: string
    key: string
    scrapeIntervalMinutes: number
    nextScrapeAt: Date | null
    lastScrapeAt: Date | null
}
