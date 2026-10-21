export interface ScrapedProperty {
    provider: string
    externalId: string
    name: string | null
    title: string | null

    areaUseful?: number | null
    areaTotal?: number | null

    priceCents: number | null
    iptuCents: number | null
    condominiumFeeCents: number | null

    url: string
    active?: boolean

    garages: number | null
    bedrooms: number | null
    bathrooms: number | null
    suites: number | null
    hasElevator: boolean | null
    doorman: string | null
    features: string[] | null

    description: string | null
    type: string | null

    address: {
        address: string | null
        cep: string | null
        type: string | null
        neighborhood: string | null
        city: string | null
        state: string | null
        latitude: number | null
        longitude: number | null
    } | null
}
