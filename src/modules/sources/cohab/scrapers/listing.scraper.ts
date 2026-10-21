import { type Locator, type Page } from 'playwright'

import type { RawCohabListing } from '../types/listing.js'

import { BASE_URL } from '../constants/urls.js'
import { normalizeText } from '../../../../common/utils/text.js'

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

async function getCardDetail(
    item: Locator,
    className: string,
): Promise<string | null> {
    return normalizeText(
        await getOptionalText(item.locator(`.${className} span`).nth(1)),
    )
}

function getExternalIdFromUrl(url: string | null): string | null {
    return url?.match(/\/(\d+)(?:\?.*)?$/)?.[1] ?? null
}

function isSaleCard(price: string | null, url: string | null): boolean {
    return Boolean(
        url && /\/comprar\//i.test(url) && (!price || /\bV\b/i.test(price)),
    )
}

export async function scrapeListingData(
    page: Page,
): Promise<RawCohabListing[]> {
    const items = page.locator('.lista-imoveis .card-imo')
    const listings: RawCohabListing[] = []

    for (let index = 0; index < (await items.count()); index++) {
        const item = items.nth(index)
        const href = await getOptionalAttribute(
            item.locator('a[href*="/"], a[href^="comprar/"]').first(),
            'href',
        )
        const url = href ? new URL(href, BASE_URL).href : null
        const price = normalizeText(
            (await getOptionalText(item.locator('.card-valores')))?.replace(
                /\bV\b/i,
                '',
            ),
        )
        const externalId =
            normalizeText(
                await getOptionalText(item.locator('.cod-imovel strong')),
            ) ?? getExternalIdFromUrl(url)

        if (
            !url ||
            !externalId ||
            !isSaleCard(
                await getOptionalText(item.locator('.card-valores')),
                url,
            )
        ) {
            continue
        }

        const title = normalizeText(
            (await getOptionalAttribute(
                item.locator('.card-titulo h2'),
                'title',
            )) ?? (await getOptionalText(item.locator('.card-titulo h2'))),
        )
        const location = normalizeText(
            await getOptionalText(item.locator('.card-bairro-cidade-texto')),
        )

        listings.push({
            externalId,
            reference: externalId,
            name: title,
            title,
            type: null,
            purpose: null,
            location,
            price,
            condoPrice: null,
            iptu: null,
            areaUseful: null,
            areaTotal: null,
            areaBuilt: await getCardDetail(item, 'a-const-ico'),
            garage: await getCardDetail(item, 'gar-ico'),
            bedrooms: await getCardDetail(item, 'dorm-ico'),
            bathrooms: await getCardDetail(item, 'banh-ico'),
            suites: null,
            description: normalizeText(
                await getOptionalText(item.locator('.card-texto p')),
            ),
            features: null,
            hasElevator: null,
            doorman: null,
            url,
        })
    }

    return listings
}
