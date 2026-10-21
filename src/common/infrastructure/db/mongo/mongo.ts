import { MongoClient } from 'mongodb'

export const client = new MongoClient(process.env.MONGODB_URI!)

await client.connect()

export const mongo = { db: client.db('real-estate'), client }

mongo.db
    .collection('raw_captures')
    .createIndex(
        { 'metadata.sourceProvider': 1, 'metadata.externalAdId': 1 },
        { unique: true },
    )
    .catch(console.error)

mongo.db
    .collection('raw_captures')
    .createIndex({ lastSeenAt: -1 })
    .catch(console.error)

mongo.db
    .collection('raw_captures')
    .createIndex({ firstSeenAt: -1 })
    .catch(console.error)

mongo.db
    .collection('raw_snapshots')
    .createIndex({ provider: 1, externalId: 1, createdAt: -1 })
    .catch(console.error)

mongo.db
    .collection('raw_snapshots')
    .createIndex({ snapshotHash: 1 })
    .catch(console.error)

mongo.db
    .collection('providers')
    .createIndex({ slug: 1 }, { unique: true })
    .catch(console.error)

mongo.db
    .collection('providers')
    .createIndex({ key: 1 }, { unique: true })
    .catch(console.error)

mongo.db
    .collection('providers')
    .createIndex({ nextScrapeAt: 1 })
    .catch(console.error)
