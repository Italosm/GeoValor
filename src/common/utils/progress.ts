import type { Logger } from 'pino'

export function logProgress(
    itemsProcessed: number,
    totalItems: number,
    startTime: number,
    logger: Logger,
    logInterval = 10,
) {
    const shouldLog =
        itemsProcessed % logInterval === 0 || itemsProcessed === totalItems

    if (shouldLog) {
        const now = Date.now()
        const elapsedTime = now - startTime
        const percentage = ((itemsProcessed / totalItems) * 100).toFixed(1)

        let logMessage = `Progress: ${itemsProcessed}/${totalItems} (${percentage}%)`

        if (elapsedTime > 100) {
            const itemsPerSecond = itemsProcessed / (elapsedTime / 1000)
            const remainingItems = totalItems - itemsProcessed
            const etaSeconds = Math.round(remainingItems / itemsPerSecond)
            const etaString =
                isFinite(etaSeconds) && etaSeconds > 0
                    ? `| ETA: ~${etaSeconds}s`
                    : ''
            logMessage += ` | ${itemsPerSecond.toFixed(
                2,
            )} items/s ${etaString}`
        }
        logger.info(logMessage)
    }
}
