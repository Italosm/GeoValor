import { createLogger } from '../logger.js'
import express from 'express'
import client from 'prom-client'
import { createBrowser } from '../browser/playwright.js'
import {
    runSingleScraper,
    type Metrics,
} from '../../services/scraper-orchestrator.service.js'
import type { ObjectId, WithId } from 'mongodb'
import {
    providersCollection,
    type Provider,
} from '../../repositories/provider.repository.js'
import { delay } from '../../utils/delay.js'
import {
    type ScrapeJob,
    scrapeJobsCollection,
    ScrapeJobStatus,
} from '../../repositories/scrape-job.repository.js'

const logger = createLogger('worker')

const SCHEDULER_INTERVAL_MS = 60 * 1000 // 1 minute
const PENDING_JOB_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CONCURRENT_JOBS = 3 // Limite de jobs em paralelo
const RESTART_DELAY_MS = 5000 // 5 seconds
const HEALTH_CHECK_PORT = 3001

const register = new client.Registry()
client.collectDefaultMetrics({ register })

const serviceRestarts = new client.Counter({
    name: 'service_restarts_total',
    help: 'Total number of restarts for a supervised service.',
    labelNames: ['service_name'],
    registers: [register],
})

const jobsProcessed = new client.Counter({
    name: 'jobs_processed_total',
    help: 'Total number of scrape jobs processed.',
    labelNames: ['provider', 'status'],
    registers: [register],
})

const jobDuration = new client.Histogram({
    name: 'job_duration_seconds',
    help: 'Duration of scrape jobs in seconds.',
    labelNames: ['provider', 'status'],
    // Buckets from 100ms to 10 minutes
    buckets: [0.1, 5, 15, 30, 60, 120, 300, 600],
    registers: [register],
})

const jobsPending = new client.Gauge({
    name: 'jobs_pending_total',
    help: 'Total number of jobs currently in PENDING state.',
    registers: [register],
})

const jobsRunning = new client.Gauge({
    name: 'jobs_running_total',
    help: 'Total number of jobs currently in RUNNING state.',
    registers: [register],
})

const jobQueueDuration = new client.Histogram({
    name: 'job_queue_duration_seconds',
    help: 'Time a job spends in the PENDING queue in seconds.',
    labelNames: ['provider'],
    // Buckets from 100ms to 1 hour
    buckets: [0.1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
    registers: [register],
})

const urlsFailed = new client.Counter({
    name: 'scrape_urls_failed_total',
    help: 'Total number of URLs that failed to scrape within a job.',
    labelNames: ['provider'],
    registers: [register],
})

const jobsStaleRemoved = new client.Counter({
    name: 'jobs_stale_removed_total',
    help: 'Total de jobs obsoletos que foram removidos da fila.',
    labelNames: ['provider'],
    registers: [register],
})

const serviceStatuses: Record<
    string,
    {
        status: 'initializing' | 'running' | 'crashed'
        restarts: number
        lastCrash?: {
            time: Date
            error: string
        }
        startedAt: Date
    }
> = {}

async function scheduleJobsPeriodically(): Promise<void> {
    logger.info(
        `Scheduler starting, will check for jobs every ${
            SCHEDULER_INTERVAL_MS / 1000
        }s.`,
    )

    while (true) {
        logger.debug('Checking for providers to schedule...')
        const providersToSchedule = await providersCollection
            .find<Provider>({
                $or: [
                    { nextScrapeAt: { $lte: new Date() } },
                    { nextScrapeAt: null },
                ],
            })
            .toArray()

        if (providersToSchedule.length > 0) {
            logger.info(
                { providers: providersToSchedule.map((p) => p.key) },
                `Found ${providersToSchedule.length} providers to schedule.`,
            )

            const jobCreationTasks = providersToSchedule.map(
                async (provider) => {
                    const jobMeta = { providerKey: provider.key }
                    const staleJobThreshold = new Date(
                        Date.now() - PENDING_JOB_TIMEOUT_MS,
                    )

                    // Verifica se existe um job obsoleto (pending por muito tempo)
                    const staleJob = await scrapeJobsCollection.findOne({
                        providerKey: provider.key,
                        status: ScrapeJobStatus.PENDING,
                        createdAt: { $lte: staleJobThreshold },
                    })

                    if (staleJob) {
                        logger.warn(
                            { ...jobMeta, jobId: staleJob._id },
                            'Found a stale PENDING job. Deleting it to reschedule.',
                        )
                        await scrapeJobsCollection.deleteOne({
                            _id: staleJob._id,
                        })
                        jobsStaleRemoved.labels(provider.key).inc()
                    }

                    // Verifica se já existe um job PENDING (recente) ou RUNNING
                    const existingJob = await scrapeJobsCollection.findOne({
                        providerKey: provider.key,
                        status: {
                            $in: [
                                ScrapeJobStatus.PENDING,
                                ScrapeJobStatus.RUNNING,
                            ],
                        },
                    })

                    if (existingJob) {
                        logger.info(
                            { ...jobMeta, status: existingJob.status },
                            'Skipping job creation, another job is already pending or running.',
                        )
                        return
                    }

                    logger.info(jobMeta, 'Creating new scrape job.')

                    // Insere um novo trabalho para ser processado pelo worker
                    await scrapeJobsCollection.insertOne({
                        providerKey: provider.key,
                        status: ScrapeJobStatus.PENDING,
                        createdAt: new Date(),
                        metrics: {},
                    })
                },
            )

            await Promise.all(jobCreationTasks)
        }

        const pendingJobsCount = await scrapeJobsCollection.countDocuments({
            status: ScrapeJobStatus.PENDING,
        })
        jobsPending.set(pendingJobsCount)
        logger.debug(
            { count: pendingJobsCount },
            'Updated pending jobs metric.',
        )

        const runningJobsCount = await scrapeJobsCollection.countDocuments({
            status: ScrapeJobStatus.RUNNING,
        })
        jobsRunning.set(runningJobsCount)
        logger.debug(
            { count: runningJobsCount },
            'Updated running jobs metric.',
        )

        await delay(SCHEDULER_INTERVAL_MS)
    }
}

async function markJobAsFailed(
    jobId: ObjectId,
    providerKey: string,
    error: unknown,
    startTime: Date,
): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const endTime = new Date()
    const durationMs = endTime.getTime() - startTime.getTime()

    jobsProcessed.labels(providerKey, 'failed').inc()
    jobDuration.labels(providerKey, 'failed').observe(durationMs / 1000)

    await scrapeJobsCollection.updateOne(
        { _id: jobId },
        {
            $set: {
                status: ScrapeJobStatus.FAILED,
                'metrics.endTime': endTime,
                'metrics.durationMs': durationMs,
                error: errorMessage,
            },
        },
    )
}

async function markJobAsCompleted(
    jobId: ObjectId,
    providerKey: string,
    metrics: Metrics,
    startTime: Date,
): Promise<void> {
    const endTime = new Date()
    const durationMs = endTime.getTime() - startTime.getTime()

    jobsProcessed.labels(providerKey, 'completed').inc()
    jobDuration.labels(providerKey, 'completed').observe(durationMs / 1000)

    if (metrics.urlsFailed > 0) {
        urlsFailed.labels(providerKey).inc(metrics.urlsFailed)
    }

    await scrapeJobsCollection.updateOne(
        { _id: jobId },
        {
            $set: {
                status: ScrapeJobStatus.COMPLETED,
                'metrics.endTime': endTime,
                'metrics.durationMs': durationMs,
                'metrics.documentsCreated': metrics.documentsCreated,
                'metrics.documentsUpdated': metrics.documentsUpdated,
                'metrics.documentsUnchanged': metrics.documentsUnchanged,
                'metrics.urlsProcessed': metrics.urlsProcessed,
                'metrics.urlsFailed': metrics.urlsFailed,
                'metrics.spyVersion': metrics.spyVersion,
            },
        },
    )
}

async function executeJob(
    job: WithId<ScrapeJob>,
    workerId: number,
): Promise<void> {
    const startTime = job.metrics.startTime! // We just set it, so it must exist.
    const createdAt = job.createdAt!

    const queueDurationMs = startTime.getTime() - createdAt.getTime()
    jobQueueDuration.labels(job.providerKey).observe(queueDurationMs / 1000)
    logger.debug({ queueDurationMs }, 'Job queue duration recorded.')

    const jobMeta = {
        providerKey: job.providerKey,
        jobId: job._id,
        workerId,
    }
    logger.info(jobMeta, 'Worker picked up a job.')

    let browser: import('playwright').Browser | undefined
    try {
        browser = await createBrowser()
        const metrics = await runSingleScraper(
            job.providerKey,
            browser,
            job._id as ObjectId,
        )
        await markJobAsCompleted(
            job._id as ObjectId,
            job.providerKey,
            metrics,
            startTime,
        )
        logger.info(jobMeta, 'Scrape job finished and marked as COMPLETED.')
    } catch (error) {
        logger.error(
            { ...jobMeta, error },
            'An error occurred during job processing. Marking job as FAILED.',
        )
        await markJobAsFailed(
            job._id as ObjectId,
            job.providerKey,
            error,
            startTime,
        )
    } finally {
        if (browser) {
            await browser.close()
            logger.info(jobMeta, `Browser closed for job.`)
        }
    }
}

async function runWorker(workerId: number): Promise<void> {
    logger.info(`Worker ${workerId} started and looking for jobs.`)
    while (true) {
        const job = await scrapeJobsCollection.findOneAndUpdate(
            { status: ScrapeJobStatus.PENDING },
            {
                $set: {
                    status: ScrapeJobStatus.RUNNING,
                    'metrics.startTime': new Date(),
                },
            },
            {
                sort: { createdAt: 1 },
                returnDocument: 'after',
            },
        )

        if (job) {
            await executeJob(job, workerId)
        } else {
            // No pending jobs, wait a bit before polling again.
            logger.debug(`Worker ${workerId} found no jobs. Sleeping for 5s.`)
            await delay(5000)
        }
    }
}

async function listenForScrapeJobs(): Promise<void> {
    logger.info(
        `Worker pool starting. Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`,
    )

    const workerPromises = Array.from({ length: MAX_CONCURRENT_JOBS }, (_, i) =>
        runWorker(i + 1),
    )

    await Promise.all(workerPromises)
}

function startHealthCheckServer(): void {
    const app = express()

    app.get('/health', (req, res) => {
        res.json(serviceStatuses)
    })

    app.get('/metrics', async (req, res) => {
        try {
            res.set('Content-Type', register.contentType)
            res.end(await register.metrics())
        } catch (ex) {
            const errorMessage = ex instanceof Error ? ex.message : String(ex)
            res.status(500).end(errorMessage)
        }
    })

    const server = app.listen(HEALTH_CHECK_PORT, () => {
        logger.info(
            `Health check server listening on port ${HEALTH_CHECK_PORT}`,
        )
    })
}

async function startSupervisedService(
    name: string,
    taskFn: () => Promise<void>,
): Promise<void> {
    serviceStatuses[name] = {
        status: 'initializing',
        restarts: 0,
        startedAt: new Date(),
    }
    logger.info({ serviceName: name }, `Starting supervised service...`)
    while (true) {
        try {
            serviceStatuses[name].status = 'running'
            delete serviceStatuses[name].lastCrash

            await taskFn()
            // If the task function completes without error, it's unexpected for a long-running service.
            const errorMessage = 'Service completed unexpectedly.'
            serviceStatuses[name].status = 'crashed'
            serviceStatuses[name].restarts++
            serviceRestarts.labels(name).inc()
            serviceStatuses[name].lastCrash = {
                time: new Date(),
                error: errorMessage,
            }
            logger.warn(
                { serviceName: name },
                `${errorMessage} Restarting in ${RESTART_DELAY_MS / 1000}s...`,
            )
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            serviceStatuses[name].status = 'crashed'
            serviceStatuses[name].restarts++
            serviceRestarts.labels(name).inc()
            serviceStatuses[name].lastCrash = {
                time: new Date(),
                error: errorMessage,
            }
            logger.error(
                { serviceName: name, error },
                `Service crashed. Restarting in ${RESTART_DELAY_MS / 1000}s...`,
            )
        }
        await delay(RESTART_DELAY_MS)
    }
}

async function main(): Promise<void> {
    logger.info('Starting services in supervised mode...')

    startHealthCheckServer()

    const servicePromises = [
        startSupervisedService('Worker Pool', listenForScrapeJobs),
        startSupervisedService('Scheduler', scheduleJobsPeriodically),
    ]

    // Promise.all here will never resolve, as the supervised services run in an
    // infinite loop. This is the desired behavior to keep the process alive.
    // Each service is self-restarting and won't bring down the others.
    await Promise.all(servicePromises)

    // This part of the code should not be reached in normal operation.
    logger.fatal('All services have terminated. Process will exit.')
}

main().catch((error: unknown) => {
    logger.fatal(
        { error },
        'Fatal error during application startup. Process will exit.',
    )
    process.exit(1)
})
