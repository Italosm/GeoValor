import ceps from '../data/ceps-aracaju.json' with { type: 'json' }
import { normalize } from '../utils/normalize.js'

type Cep = {
    cep: string | null
    bairro: string | null
    tipoLogradouro: string | null
    tituloLogradouro: string | null
    logradouro: string | null
    logradouroNormalizado: string | null
    latitude: string | null
    longitude: string | null
}

const cepPorLogradouro = new Map(
    ceps
        .filter((item) => item.logradouroNormalizado)
        .map((item) => [item.logradouroNormalizado, item]),
)

export type CepDetails = Cep

export class CepResolver {
    private static findByLogradouro(
        logradouro?: string,
        bairro?: string | null,
    ): Cep | null {
        if (!logradouro) {
            return null
        }

        const normalized = normalize(logradouro)
        const bairroNormalizado = bairro ? normalize(bairro) : null

        // Busca exata primeiro
        if (cepPorLogradouro.has(normalized)) {
            const cep = cepPorLogradouro.get(normalized)
            // Se bairro foi informado, valida se é o mesmo
            if (bairroNormalizado && cep?.bairro) {
                if (normalize(cep.bairro) === bairroNormalizado) {
                    return cep
                }
            } else {
                return cep ?? null
            }
        }

        // Se não encontrou exato, busca parcial (primeiras palavras)
        const words = normalized.split(' ').slice(0, 2).join(' ')
        for (const [key, cep] of cepPorLogradouro) {
            if (key.startsWith(words)) {
                // Se bairro foi informado, valida se é o mesmo
                if (bairroNormalizado && cep.bairro) {
                    if (normalize(cep.bairro) === bairroNormalizado) {
                        return cep
                    }
                } else {
                    return cep
                }
            }
        }

        return null
    }

    private static findByCoordinates(
        latitude?: number,
        longitude?: number,
        bairro?: string | null,
    ): Cep | null {
        if (latitude === undefined || longitude === undefined) {
            return null
        }

        let nearest: Cep | null = null
        let minDistance = Infinity

        for (const cep of ceps) {
            if (!cep.latitude || !cep.longitude) {
                continue
            }

            // Se bairro foi informado, valida se é o mesmo
            if (
                bairro &&
                cep.bairro &&
                normalize(cep.bairro) !== normalize(bairro)
            ) {
                continue
            }

            const lat = Number(cep.latitude)
            const lon = Number(cep.longitude)

            const distance = (lat - latitude) ** 2 + (lon - longitude) ** 2

            if (distance < minDistance) {
                minDistance = distance
                nearest = cep
            }
        }

        // aproximadamente 1~2 km - mais permissivo
        if (minDistance > 0.01) {
            return null
        }

        return nearest
    }

    static resolve(params: {
        logradouro?: string
        bairro?: string | null
        latitude?: number | null
        longitude?: number | null
    }): string | null {
        const byLogradouro = this.findByLogradouro(
            params.logradouro,
            params.bairro,
        )

        if (byLogradouro?.cep) {
            return byLogradouro.cep
        }

        if (params.latitude === null || params.longitude === null) {
            return null
        }

        const byCoordinates = this.findByCoordinates(
            params.latitude,
            params.longitude,
            params.bairro,
        )

        if (byCoordinates?.cep) {
            return byCoordinates.cep
        }

        return null
    }

    static resolveDetails(params: {
        logradouro?: string
        bairro?: string | null
        latitude?: number | null
        longitude?: number | null
    }): Cep | null {
        const byLogradouro = this.findByLogradouro(
            params.logradouro,
            params.bairro,
        )

        if (byLogradouro) {
            return byLogradouro
        }

        if (params.latitude === null || params.longitude === null) {
            return null
        }

        return this.findByCoordinates(
            params.latitude,
            params.longitude,
            params.bairro,
        )
    }
}
