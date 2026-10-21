import { chromium } from 'playwright'

export async function createBrowser() {
    return chromium.launch({
        headless: true,
    })
}
