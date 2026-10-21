import type { ScrapedProperty } from '../../../../common/types/scraper.js'

import { parseCityLocation } from '../../../../common/utils/address.js'
import { detectAddressType } from '../../../../common/utils/addressType.js'
import {
    extractNumericText,
    toCents,
    toFirstNumber,
} from '../../../../common/utils/number.js'
import { extractPropertyFeatureSignals } from '../../../../common/utils/property-features.js'
import type { RawLegislarListing } from '../types/listing.js'
import { PROVIDER } from '../constants/urls.js'

export function mapProperty(listing: RawLegislarListing): ScrapedProperty {
    const addressName =
        listing.address?.address ?? listing.name ?? listing.location
    const location = parseCityLocation(listing.location)
    const featureSignals = extractPropertyFeatureSignals([
        listing.description,
        ...(listing.features ?? []),
    ])

    return {
        provider: PROVIDER,
        externalId: listing.externalId,
        active: listing.active ?? true,
        name: listing.name,
        title: listing.title ?? listing.type,
        type: listing.type,
        areaUseful: toFirstNumber(listing.areaUseful),
        areaTotal: toFirstNumber(listing.areaTotal),
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
        description: listing.description ?? null,
        address: addressName
            ? {
                  address: addressName,
                  cep: null,
                  type: detectAddressType(addressName),
                  neighborhood:
                      listing.address?.neighborhood ?? location.neighborhood,
                  city: listing.address?.city ?? location.city,
                  state: listing.address?.state ?? location.state,
                  latitude: listing.address?.latitude ?? null,
                  longitude: listing.address?.longitude ?? null,
              }
            : null,
    }
}
