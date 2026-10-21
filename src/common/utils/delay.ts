/**
 * Creates a promise that resolves after a specific delay.
 * @param ms The delay in milliseconds.
 * @returns A promise that resolves after the delay.
 */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a promise that resolves after a random delay.
 * @param min The minimum delay in milliseconds.
 * @param max The maximum delay in milliseconds.
 * @returns A promise that resolves after the delay.
 */
export function randomDelay(min: number, max: number): Promise<void> {
    const ms = Math.random() * (max - min) + min
    return new Promise((resolve) => setTimeout(resolve, ms))
}
