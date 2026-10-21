export interface ParsedCityLocation {
    neighborhood: string | null
    city: string | null
    state: string | null
}

export function parseCityLocation(
    location: string | null | undefined,
): ParsedCityLocation {
    if (!location) {
        return {
            neighborhood: null,
            city: null,
            state: null,
        }
    }

    const [neighborhoodRaw, cityAndStateRaw] = location
        .split(',')
        .map((part) => {
            return part.trim()
        })

    const [cityRaw, stateRaw] = (cityAndStateRaw ?? '')
        .split(' - ')
        .map((part) => {
            return part.trim()
        })

    return {
        neighborhood: neighborhoodRaw || null,
        city: cityRaw || null,
        state: stateRaw || null,
    }
}
