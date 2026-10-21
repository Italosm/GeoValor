import { type Locator, type Page } from 'playwright'

import { mapProperty } from '../mappers/property.mapper.js'
import type { RawLegislarListing } from '../types/listing.js'

import type { ScrapedProperty } from '../../../../common/types/scraper.js'
import { normalizeText } from '../../../../common/utils/text.js'
import { extractPropertyFeatureSignals } from '../../../../common/utils/property-features.js'
import { createLogger } from '../../../../common/infrastructure/logger.js'

async function getOptionalText(locator: Locator): Promise<string | null> {
    if ((await locator.count()) === 0) {
        return null
    }

    return locator.first().textContent()
}

async function getOptionalAttribute(
    locator: Locator,
    attribute: string,
): Promise<string | null> {
    if ((await locator.count()) === 0) {
        return null
    }

    return locator.first().getAttribute(attribute)
}

async function getBoxedDetailText(
    page: Page,
    className: string,
): Promise<string | null> {
    return normalizeText(
        await getOptionalText(
            page.locator(`.boxed_mini_details1 .${className}`),
        ),
    )
}

async function getPriceByLabel(
    page: Page,
    label: RegExp,
): Promise<string | null> {
    return normalizeText(
        await getOptionalText(
            page
                .locator('.price_property')
                .filter({ hasText: label })
                .locator('.priceBig'),
        ),
    )
}

function getSuites(bedrooms: string | null): string | null {
    return normalizeText(bedrooms?.match(/\(([^)]*Su[ií]tes?)[^)]*\)/i)?.[1])
}

function parseCityAndState(value: string | null): {
    city: string | null
    state: string | null
} {
    const cityAndState = value?.replace(/^Cidade:\s*/i, '')

    if (!cityAndState) {
        return {
            city: null,
            state: null,
        }
    }

    const [city, state] = cityAndState.split(' - ').map((part) => part.trim())

    return {
        city: city || null,
        state: state || null,
    }
}

function parseCoordinates(mapUrl: string | null): {
    latitude: number | null
    longitude: number | null
} {
    if (!mapUrl) {
        return {
            latitude: null,
            longitude: null,
        }
    }

    const coordinates = mapUrl.match(
        /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    )

    return {
        latitude: coordinates?.[1] ? Number(coordinates[1]) : null,
        longitude: coordinates?.[2] ? Number(coordinates[2]) : null,
    }
}

function isSaleTransaction(transaction: string | null): boolean {
    if (!transaction) {
        return false
    }

    return (
        /\bvenda\b/i.test(transaction) &&
        !/aluguel|loca[cç][aã]o/i.test(transaction)
    )
}

async function getAddress(page: Page, listing: RawLegislarListing) {
    const streetWithNumber = normalizeText(
        await getOptionalText(
            page.locator('#location .cleardiv:has(.fa-map-marker-alt)'),
        ),
    )
    const building = normalizeText(
        await getOptionalText(
            page.locator('#location .cleardiv:has(.fa-landmark)'),
        ),
    )
    const neighborhood = normalizeText(
        (
            await getOptionalText(
                page
                    .locator('#location .cleardiv')
                    .filter({ hasText: /^Bairro:/i }),
            )
        )?.replace(/^Bairro:\s*/i, ''),
    )
    const cityText = normalizeText(
        await getOptionalText(
            page
                .locator('#location .cleardiv')
                .filter({ hasText: /^Cidade:/i }),
        ),
    )
    const { city, state } = parseCityAndState(cityText)
    const mapUrl = await getOptionalAttribute(
        page.locator('a.iziopenMap'),
        'href',
    )
    const { latitude, longitude } = parseCoordinates(mapUrl)
    const addressName =
        streetWithNumber ?? building ?? listing.name ?? listing.location

    if (!addressName) {
        return null
    }

    return {
        address: addressName,
        neighborhood,
        city,
        state,
        latitude,
        longitude,
    }
}

async function getFeatureTexts(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const sections = Array.from(
            document.querySelectorAll('.property-heading.property-info'),
        )

        const texts: string[] = []

        for (const section of sections) {
            const heading = section
                .querySelector('h4 span')
                ?.textContent?.trim()
                .toLowerCase()

            if (
                !heading ||
                !['detalhes', 'características'].includes(heading)
            ) {
                continue
            }

            const listItems = Array.from(section.querySelectorAll('li'))
                .map((item) => item.textContent?.trim() ?? '')
                .filter(Boolean)

            const gridItems = Array.from(section.querySelectorAll('div'))
                .map((item) => item.textContent?.trim() ?? '')
                .filter(Boolean)

            texts.push(...listItems, ...gridItems)
        }

        return texts
    })
}

export async function scrapePropertyData(
    page: Page,
    listing: RawLegislarListing,
): Promise<{
    property: ScrapedProperty | null
    rawHtml: string | null
    retryable?: boolean
}> {
    const gotoAttempts = 3
    let lastGotoError: unknown = null
    const logger = createLogger('property:legislar')
    for (let attempt = 1; attempt <= gotoAttempts; attempt++) {
        try {
            await page.goto(listing.url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            })

            await page.waitForSelector('.property-description', {
                timeout: 60000,
            })

            lastGotoError = null
            break
        } catch (err) {
            lastGotoError = err

            const message = String((err as any)?.message ?? err)

            if (
                message.includes('interrupted by another navigation') ||
                message.includes('Navigation to')
            ) {
                logger.warn(
                    `Navegação interrompida para ${listing.externalId}, tentativa ${attempt} de ${gotoAttempts}. Aguardando antes de retry...`,
                )
                await page.waitForTimeout(2000)
                continue
            }

            logger.error({ err }, `Erro ao navegar para ${listing.url}:`)
            return { property: null, rawHtml: null, retryable: false }
        }
    }

    if (lastGotoError) {
        logger.error(
            { lastGotoError },
            `Falha ao navegar para ${listing.url} depois de ${gotoAttempts} tentativas:`,
        )
        await page.waitForTimeout(2000)
        return { property: null, rawHtml: null, retryable: true }
    }

    const transaction = normalizeText(
        await getOptionalText(
            page
                .locator('.price_property')
                .filter({ hasText: /\bVenda\b/i })
                .locator('.transacao'),
        ),
    )

    if (!isSaleTransaction(transaction)) {
        return { property: null, rawHtml: null, retryable: false }
    }

    const bedrooms = await getBoxedDetailText(page, 'bedrooms')
    const address = await getAddress(page, listing)
    const featureTexts = await getFeatureTexts(page)
    const areaTotal = normalizeText(
        await getOptionalText(
            page
                .locator(
                    '.property-heading:has-text("Áreas") .grid-container div',
                )
                .filter({ hasText: /Área Total/i }),
        ),
    )
    const areaUseful = normalizeText(
        await getOptionalText(
            page
                .locator(
                    '.property-heading:has-text("Áreas") .grid-container div',
                )
                .filter({ hasText: /Área Útil/i }),
        ),
    )
    const featureSignals = extractPropertyFeatureSignals(featureTexts ?? [])
    const detailedListing: RawLegislarListing = {
        ...listing,
        areaUseful: areaUseful ?? null,
        areaTotal: areaTotal ?? null,
        price: (await getPriceByLabel(page, /\bVenda\b/i)) ?? listing.price,
        iptu: await getPriceByLabel(page, /\bIPTU\b/i),
        condoPrice: await getPriceByLabel(page, /Condom[ií]nio/i),
        garage: (await getBoxedDetailText(page, 'garage')) ?? listing.garage,
        bedrooms: bedrooms ?? listing.bedrooms,
        bathrooms:
            (await getBoxedDetailText(page, 'status')) ?? listing.bathrooms,
        suites: getSuites(bedrooms) ?? listing.suites,
        description: normalizeText(
            await getOptionalText(page.locator('#showmore-1 .show-more')),
        ),
        features: featureSignals.features,
        hasElevator: featureSignals.hasElevator,
        doorman: featureSignals.doorman,
        address,
    }

    const mappedProperty = mapProperty(detailedListing)
    const rawHtml = mappedProperty ? await page.content() : null

    return { property: mappedProperty, rawHtml }
}
