export function normalize(value?: string | null): string {
    if (!value) return ''

    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.,;:]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
}
