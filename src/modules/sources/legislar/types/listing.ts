export interface RawLegislarListing {
    externalId: string
    reference: string | null
    name: string | null
    title: string | null
    type: string | null
    area: string | null
    areaUseful?: string | null
    areaTotal?: string | null
    price: string | null
    url: string
    garage: string | null
    bedrooms: string | null
    bathrooms: string | null
    suites: string | null
    location: string | null
    description?: string | null
    iptu?: string | null
    condoPrice?: string | null
    features?: string[] | null
    hasElevator?: boolean | null
    doorman?: string | null
    active?: boolean
    address?: {
        address: string
        neighborhood: string | null
        city: string | null
        state: string | null
        latitude: number | null
        longitude: number | null
    } | null
}
