export type TypeAddress =
    | 'RUA'
    | 'AVENIDA'
    | 'TRAVESSA'
    | 'ESTRADA'
    | 'RODOVIA'
    | 'ALAMEDA'
    | 'LOTEAMENTO'
    | 'PRACA'
    | null

function normalizeStreetValue(streetName: string): string {
    return streetName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
}

function detectAddressType(streetName: string | null): TypeAddress | null {
    if (!streetName) return null

    const upper = normalizeStreetValue(streetName)

    if (/^(RUA|R)\b/.test(upper)) return 'RUA'

    if (/^(AVENIDA|AVEN|AV)\b/.test(upper)) {
        return 'AVENIDA'
    }

    if (/^(TRAVESSA|TRAV|TV|TRV)\b/.test(upper)) {
        return 'TRAVESSA'
    }

    if (/^(ESTRADA|EST)\b/.test(upper)) {
        return 'ESTRADA'
    }

    if (
        /^(RODOVIA|ROD|RD)\b/.test(upper) ||
        /^(BR|SE|AL|BA|PE|PB|RN|CE|PI|MA|PA|AM|RR|AP|AC|RO|TO|DF|GO|MT|MS|MG|ES|RJ|SP|PR|SC|RS)-\d+/.test(
            upper,
        )
    ) {
        return 'RODOVIA'
    }

    if (/^(ALAMEDA|AL)\b/.test(upper)) {
        return 'ALAMEDA'
    }

    if (/^(LOTEAMENTO|LOT|LTM)\b/.test(upper)) {
        return 'LOTEAMENTO'
    }

    if (/^(PRACA|PRC|PRA[ÇC]A)\b/.test(upper)) {
        return 'PRACA'
    }

    return null
}

export { detectAddressType }
