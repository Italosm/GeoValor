import { type Page } from 'playwright'

interface ScrollToEndOptions {
    maxNoChangeCount?: number
    timeout?: number
}

export async function scrollToEnd(
    page: Page,
    options: ScrollToEndOptions = {},
): Promise<void> {
    const maxNoChangeCount = options.maxNoChangeCount ?? 5
    const timeout = options.timeout ?? 500

    let noChangeCount = 0
    let lastHeight = 0

    while (true) {
        const currentHeight = await page.evaluate<number>(
            'document.body.scrollHeight',
        )

        await page.evaluate('window.scrollBy(0, window.innerHeight * 2)')

        await page
            .waitForFunction(
                `document.body.scrollHeight > ${JSON.stringify(currentHeight)}`,
                { timeout },
            )
            .catch(() => {})

        const newHeight = await page.evaluate<number>(
            'document.body.scrollHeight',
        )

        if (newHeight === lastHeight) {
            noChangeCount++
        } else {
            noChangeCount = 0
        }

        lastHeight = newHeight

        if (noChangeCount >= maxNoChangeCount) {
            break
        }
    }
}
