export interface RawCohabAddress {
    address: string
    cep?: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
    latitude: number | null
    longitude: number | null
}

export interface RawCohabListing {
    externalId: string
    reference: string | null
    name: string | null
    title: string | null
    type: string | null
    purpose: string | null
    location: string | null
    price: string | null
    condoPrice: string | null
    iptu: string | null
    areaUseful: string | null
    areaTotal: string | null
    areaBuilt: string | null
    garage: string | null
    bedrooms: string | null
    bathrooms: string | null
    suites: string | null
    description: string | null
    features: string[] | null
    hasElevator: boolean | null
    doorman: string | null
    url: string
    active?: boolean
    address?: RawCohabAddress | null
}
