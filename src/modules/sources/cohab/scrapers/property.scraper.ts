import { type Locator, type Page } from 'playwright'

import type { ScrapedProperty } from '../../../../common/types/scraper.js'
import { extractPropertyFeatureSignals } from '../../../../common/utils/property-features.js'
import { normalizeText } from '../../../../common/utils/text.js'
import { mapProperty } from '../mappers/property.mapper.js'
import type { RawCohabListing } from '../types/listing.js'
import { createLogger } from '../../../../common/infrastructure/logger.js'

async function getOptionalText(locator: Locator): Promise<string | null> {
    if ((await locator.count()) === 0) {
        return null
    }

    return locator.first().textContent()
}

async function getValueFromInfoBox(
    page: Page,
    className: string,
): Promise<string | null> {
    return normalizeText(
        await getOptionalText(page.locator(`.${className} .fw-bold`).first()),
    )
}

async function getPriceByLabel(
    page: Page,
    label: RegExp,
): Promise<string | null> {
    const rows = page.locator('#valores_imovel .row')

    for (let index = 0; index < (await rows.count()); index++) {
        const row = rows.nth(index)
        const labelText = normalizeText(
            await getOptionalText(row.locator('.col-7')),
        )

        if (!labelText || !label.test(labelText)) {
            continue
        }

        return normalizeText(await getOptionalText(row.locator('.col-5')))
    }

    return null
}

async function getFeatureTexts(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll('.itens-imo'))
            .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '')
            .filter(Boolean)
    })
}

function parseTypeFromSubtitle(subtitle: string | null): string | null {
    if (!subtitle) {
        return null
    }

    const [type] = subtitle.split('-').map((part) => part.trim())

    return type || null
}

function parsePurposeFromSubtitle(subtitle: string | null): string | null {
    return subtitle?.match(/\b(Residencial|Comercial)\b/i)?.[1] ?? null
}

function parseLocation(value: string | null): {
    neighborhood: string | null
    city: string | null
    state: string | null
} {
    if (!value) {
        return {
            neighborhood: null,
            city: null,
            state: null,
        }
    }

    const [neighborhoodRaw, cityAndStateRaw] = value
        .split(/\s+-\s+/)
        .map((part) => part.trim())
    const [cityRaw, stateRaw] = (cityAndStateRaw ?? '')
        .split('/')
        .map((part) => part.trim())

    return {
        neighborhood: neighborhoodRaw || null,
        city: cityRaw || null,
        state: stateRaw || null,
    }
}

function parseMapCoordinates(pageHtml: string): {
    latitude: number | null
    longitude: number | null
} {
    const mapInitRegex =
        /initLeafletMap\(\s*['"][^'"]+['"],\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g
    const initMatch = mapInitRegex.exec(pageHtml)

    if (initMatch?.[1] && initMatch?.[2]) {
        return {
            latitude: Number(initMatch[1]),
            longitude: Number(initMatch[2]),
        }
    }

    const matches = Array.from(
        pageHtml.matchAll(
            /L\.(?:marker|circle)\(\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g,
        ),
    )
    const selected = matches[0]

    return {
        latitude: selected?.[1] ? Number(selected[1]) : null,
        longitude: selected?.[2] ? Number(selected[2]) : null,
    }
}

function isSalePage(price: string | null, url: string): boolean {
    return Boolean(price || /\/comprar\//i.test(url))
}

export async function scrapePropertyData(
    page: Page,
    listing: RawCohabListing,
): Promise<{
    property: ScrapedProperty | null
    rawHtml: string | null
    retryable?: boolean
}> {
    const maxGotoAttempts = 3
    let lastGotoError: unknown = null
    const logger = createLogger('property:cohab')

    for (let attempt = 1; attempt <= maxGotoAttempts; attempt++) {
        try {
            await page.goto(listing.url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            })

            await page.waitForSelector('.titulo-imovel, .descricao-imovel', {
                timeout: 60000,
            })

            lastGotoError = null
            break
        } catch (err) {
            lastGotoError = err
            const message = String((err as Error)?.message ?? err)

            if (
                message.includes('interrupted by another navigation') ||
                message.includes('Navigation to')
            ) {
                logger.warn(
                    `Navegação interrompida para ${listing.externalId}, tentativa ${attempt} de ${maxGotoAttempts}. Aguardando antes de retry...`,
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
            `Falha ao navegar para ${listing.url} depois de ${maxGotoAttempts} tentativas:`,
        )
        await page.waitForTimeout(2000)
        return { property: null, rawHtml: null, retryable: true }
    }

    const price = (await getPriceByLabel(page, /\bVenda\b/i)) ?? listing.price

    if (!isSalePage(price, listing.url)) {
        return { property: null, rawHtml: null, retryable: false }
    }

    const subtitle = normalizeText(
        await getOptionalText(page.locator('.subtitulo-imovel')),
    )
    const features = await getFeatureTexts(page)
    const featureSignals = extractPropertyFeatureSignals(features)
    const html = await page.content()
    const { latitude, longitude } = parseMapCoordinates(html)
    const location = parseLocation(listing.location)

    const detailedListing: RawCohabListing & {
        latitude?: number | null
        longitude?: number | null
    } = {
        ...listing,
        name:
            normalizeText(
                await getOptionalText(page.locator('.titulo-imovel')),
            ) ?? listing.name,
        title:
            normalizeText(
                await getOptionalText(page.locator('.titulo-imovel')),
            ) ?? listing.title,
        type: parseTypeFromSubtitle(subtitle) ?? listing.type,
        purpose: parsePurposeFromSubtitle(subtitle) ?? listing.purpose,
        price,
        condoPrice:
            (await getPriceByLabel(page, /Condom[ií]nio/i)) ??
            listing.condoPrice,
        iptu: (await getPriceByLabel(page, /\bIPTU\b/i)) ?? listing.iptu,
        areaBuilt:
            (await getValueFromInfoBox(page, 'a-const-ico-imo')) ??
            listing.areaBuilt,
        areaUseful:
            normalizeText(
                features
                    .find((feature) => /Área Útil/i.test(feature))
                    ?.replace(/^Área Útil\s*:\s*/i, ''),
            ) ?? listing.areaUseful,
        garage:
            (await getValueFromInfoBox(page, 'gar-ico-imo')) ?? listing.garage,
        bedrooms:
            (await getValueFromInfoBox(page, 'dorm-ico-imo')) ??
            listing.bedrooms,
        bathrooms:
            (await getValueFromInfoBox(page, 'banh-ico-imo')) ??
            listing.bathrooms,
        description:
            normalizeText(
                await getOptionalText(page.locator('.descricao-imovel')),
            ) ?? listing.description,
        features: featureSignals.features,
        hasElevator: featureSignals.hasElevator,
        doorman: featureSignals.doorman,
        address: listing.address
            ? {
                  ...listing.address,
                  neighborhood:
                      listing.address.neighborhood ?? location.neighborhood,
                  city: listing.address.city ?? location.city,
                  state: listing.address.state ?? location.state,
              }
            : undefined,
        latitude,
        longitude,
    }

    const mappedProperty = mapProperty(detailedListing)

    return { property: mappedProperty, rawHtml: html }
}
