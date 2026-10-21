import { type Locator, type Page } from 'playwright'

import type { RawLegislarListing } from '../types/listing.js'

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

async function getDetailText(
    item: Locator,
    iconClass: string,
): Promise<string | null> {
    return getOptionalText(
        item.locator(`.listing-details li:has(.${iconClass})`),
    )
}

function removeText(
    source: string | null,
    value: string | null,
): string | null {
    if (!source || !value) {
        return source
    }

    return source.replace(value, ' ')
}

function getLocationFromTitle(
    titleText: string | null,
    listing: Pick<RawLegislarListing, 'name' | 'reference' | 'type'>,
): string | null {
    let location = titleText?.replace(/Ref\.:\s*/i, ' ') ?? null

    location = removeText(location, listing.reference)
    location = removeText(location, listing.type)
    location = removeText(location, listing.name)
    location = removeText(location, '+ Detalhes')

    return normalizeText(location)
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

export async function scrapeListingData(
    page: Page,
): Promise<RawLegislarListing[]> {
    const items = page.locator('#dadosimoveis .listing-item')
    const listings: RawLegislarListing[] = []

    for (let index = 0; index < (await items.count()); index++) {
        const item = items.nth(index)
        const transaction = normalizeText(
            await getOptionalText(
                item.locator('.product-price-list .transacao'),
            ),
        )

        if (!isSaleTransaction(transaction)) {
            continue
        }

        const imageLink = item.locator('a.listing-img-container')
        const detailLink = item.locator('a.details')
        const href =
            (await getOptionalAttribute(detailLink, 'href')) ??
            (await getOptionalAttribute(imageLink, 'href'))
        const url = href ? new URL(href, page.url()).href : null
        const externalId =
            (await getOptionalAttribute(
                item.locator('.call_whats'),
                'data-anuncio',
            )) ?? url?.match(/\/imovel\/(\d+)\//)?.[1]

        if (!url || !externalId) {
            continue
        }

        const reference = normalizeText(
            (await getOptionalText(item.locator('.referencia')))?.replace(
                /^Ref\.:\s*/i,
                '',
            ),
        )
        const name = normalizeText(
            (await getOptionalText(
                item.locator('.listing-title .notranslate'),
            )) ??
                (await getOptionalAttribute(
                    item.locator('.listing-carousel img'),
                    'alt',
                )),
        )
        const type = normalizeText(
            await getOptionalText(item.locator('.listing-title h4 a')),
        )
        const bedrooms = normalizeText(
            await getDetailText(item, 'glyphicon-bed-alt'),
        )
        const titleText = normalizeText(
            await getOptionalText(item.locator('.listing-title')),
        )

        listings.push({
            externalId,
            reference,
            name,
            title: type,
            type,
            area: normalizeText(
                await getDetailText(item, 'glyphicon-resize-full'),
            ),
            price: normalizeText(
                await getOptionalText(item.locator('.priceBig')),
            ),
            url,
            garage: normalizeText(await getDetailText(item, 'glyphicon-car')),
            bedrooms,
            bathrooms: normalizeText(
                await getDetailText(item, 'glyphicon-bath-shower'),
            ),
            suites: normalizeText(
                bedrooms?.match(/\(([^)]*Su[ií]tes?)[^)]*\)/i)?.[1],
            ),
            location: getLocationFromTitle(titleText, {
                reference,
                name,
                type,
            }),
        })
    }

    return listings
}
