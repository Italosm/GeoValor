import { type Page } from 'playwright'

export async function scrapeListingLinks(page: Page): Promise<string[]> {
    const anchors = page.locator(
        '#resultsData li a, #buscaInteligenteContainer li a',
    )
    const links: string[] = []

    for (let index = 0; index < (await anchors.count()); index++) {
        const href = await anchors.nth(index).getAttribute('href')

        if (href) {
            links.push(new URL(href, page.url()).href)
        }
    }

    return [...new Set(links)]
}
