export function toNumber(value: unknown): number | null {
    if (value == null) return null

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null
    }

    if (typeof value === 'string') {
        const normalized = value.replace(/\./g, '').replace(',', '.').trim()

        const parsed = Number(normalized)

        return Number.isFinite(parsed) ? parsed : null
    }

    return null
}

export function extractNumericText(
    value: string | null | undefined,
): string | null {
    if (!value) {
        return null
    }

    const match = value.match(/\d[\d.]*(?:,\d+)?/)

    return match?.[0] ?? null
}

export function toFirstNumber(value: string | null | undefined): number | null {
    return toNumber(extractNumericText(value))
}

export function toCents(value: unknown): number | null {
    const parsed = toNumber(value)

    if (parsed == null || parsed === 0) {
        return null
    }

    return Math.round(parsed * 100)
}
