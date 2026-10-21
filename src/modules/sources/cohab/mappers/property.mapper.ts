import type { ScrapedProperty } from '../../../../common/types/scraper.js'
import { detectAddressType } from '../../../../common/utils/addressType.js'
import {
    extractNumericText,
    toCents,
    toFirstNumber,
} from '../../../../common/utils/number.js'
import { extractPropertyFeatureSignals } from '../../../../common/utils/property-features.js'
import { PROVIDER } from '../constants/urls.js'
import type { RawCohabListing } from '../types/listing.js'

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

function toAreaNumber(value: string | null | undefined): number | null {
    const numericText = extractNumericText(value)

    if (!numericText) {
        return null
    }

    if (numericText.includes(',')) {
        return toFirstNumber(numericText)
    }

    const parsed = Number(numericText)

    return Number.isFinite(parsed) ? parsed : null
}

export function mapProperty(
    listing: RawCohabListing & {
        latitude?: number | null
        longitude?: number | null
    },
): ScrapedProperty {
    const location = parseLocation(listing.location)
    const streetAddress = listing.address?.address ?? null

    const hasAddressInfo =
        streetAddress ||
        listing.address?.cep ||
        location.neighborhood ||
        location.city ||
        listing.latitude ||
        listing.longitude

    const featureSignals = extractPropertyFeatureSignals([
        listing.description,
        ...(listing.features ?? []),
    ])

    return {
        provider: PROVIDER,
        externalId: listing.externalId,
        active: listing.active ?? true,
        name: listing.name,
        title: listing.title ?? listing.name,
        type: listing.type,
        areaUseful: toAreaNumber(
            listing.areaUseful ?? listing.areaBuilt ?? listing.areaTotal,
        ),
        areaTotal: toAreaNumber(listing.areaTotal),
        priceCents: toCents(extractNumericText(listing.price)),
        iptuCents: toCents(extractNumericText(listing.iptu)),
        condominiumFeeCents: toCents(extractNumericText(listing.condoPrice)),
        url: listing.url,
        garages: toFirstNumber(listing.garage),
        bedrooms: toFirstNumber(listing.bedrooms),
        bathrooms: toFirstNumber(listing.bathrooms),
        suites: toFirstNumber(listing.suites),
        hasElevator: listing.hasElevator ?? featureSignals.hasElevator,
        doorman: listing.doorman ?? featureSignals.doorman,
        features: listing.features ?? featureSignals.features,
        description: listing.description,
        address: hasAddressInfo
            ? {
                  address: streetAddress,
                  cep: listing.address?.cep ?? null,
                  type: detectAddressType(streetAddress ?? ''),
                  neighborhood:
                      listing.address?.neighborhood ?? location.neighborhood,
                  city: listing.address?.city ?? location.city,
                  state: listing.address?.state ?? location.state,
                  latitude:
                      listing.latitude ?? listing.address?.latitude ?? null,
                  longitude:
                      listing.longitude ?? listing.address?.longitude ?? null,
              }
            : null,
    }
}
