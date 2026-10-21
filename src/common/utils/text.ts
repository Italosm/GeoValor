export function normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.replace(/\s+/g, ' ').trim()

    return normalized || null
}
