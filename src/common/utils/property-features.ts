import { normalizeText } from './text.js'

export interface PropertyFeatureSignals {
    features: string[]
    hasElevator: boolean | null
    doorman: string | null
}

type FeatureRule = {
    label: string
    patterns: RegExp[]
}

const FEATURE_RULES: FeatureRule[] = [
    {
        label: 'Academia',
        patterns: [
            /academia/,
            /espaco fitness/,
            /fitness/,
            /sala de academia/,
            /gym/,
            /exercise room/,
            /sala de pilates/,
        ],
    },
    {
        label: 'Piscina',
        patterns: [
            /piscina/,
        ],
    },
    {
        label: 'Quadra',
        patterns: [
            /quadra/,
            /beach tennis/,
            /beach tenis/,
            /\btenis\b/,
            /squash/,
            /poliesportiva/,
            /esportiva/,
        ],
    },
    {
        label: 'Energia solar',
        patterns: [/energia solar/, /painel fotovoltaico/, /fotovoltaic/],
    },
    {
        label: 'Churrasqueira',
        patterns: [/churrasqueira/],
    },
    {
        label: 'Salão de festas',
        patterns: [/salao de festas?/],
    },
    {
        label: 'Espaço gourmet',
        patterns: [/espaco gourmet/],
    },
    {
        label: 'Playground',
        patterns: [/playground/, /parquinho infantil/, /parque infantil/],
    },
    {
        label: 'Brinquedoteca',
        patterns: [/brinquedoteca/],
    },
    {
        label: 'Elevador',
        patterns: [/elevador/, /elevadores?/, /elevador com gerador/],
    },
    {
        label: 'Área de lazer',
        patterns: [/area de lazer/, /lazer completa/, /area lazer/],
    },
    {
        label: 'Salão gourmet',
        patterns: [/salao gourmet/],
    },
    {
        label: 'Salão de jogos',
        patterns: [/salao com jogos/, /salao de jogos/],
    },
    {
        label: 'Salão de cinema',
        patterns: [/salao video cinema/, /video cinema/],
    },
    {
        label: 'Sauna',
        patterns: [/sauna/],
    },
    {
        label: 'SPA',
        patterns: [/\bspa\b/],
    },
    {
        label: 'Pet place',
        patterns: [/pet place/],
    },
    {
        label: 'Pista de cooper',
        patterns: [/pista cooper/],
    },
    {
        label: 'Pista de skate',
        patterns: [/pista skate/],
    },
    {
        label: 'Lavanderia coletiva',
        patterns: [/lavanderia coletiva/],
    },
    {
        label: 'Tomada para carro elétrico',
        patterns: [/tomada para carro eletrico/, /carro eletrico/],
    },
    {
        label: 'Heliponto',
        patterns: [/heliponto/],
    },
    {
        label: 'Espaço de leitura',
        patterns: [/espaco de leitura/],
    },
    {
        label: 'Portaria 24h',
        patterns: [/portaria 24h/],
    },
    {
        label: 'Segurança',
        patterns: [
            /com guarita blindada/,
            /guarita com seguranca/,
            /sistema de seguranca/,
            /seguranca/,
            /portao eletronico/,
            /circuito interno tv/,
            /monitoramento/,
        ],
    },
]

const DOORMAN_RULES: FeatureRule[] = [
    {
        label: 'Portaria 24h',
        patterns: [/portaria 24h/],
    },
    {
        label: 'Guarita com segurança',
        patterns: [/com guarita blindada/, /guarita com seguranca/, /guarita/],
    },
    {
        label: 'Segurança',
        patterns: [/sistema de seguranca/, /seguranca/, /portao eletronico/],
    },
]

function normalizeFeatureCandidate(value: string): string {
    return normalizeText(value)
        ?.normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') ?? ''
}

export function extractPropertyFeatureSignals(
    values: Array<string | null | undefined>,
): PropertyFeatureSignals {
    const normalizedValues = values
        .map((value) => {
            return normalizeFeatureCandidate(value ?? '')
        })
        .filter(Boolean)

    const features = new Set<string>()
    let doorman: string | null = null

    for (const value of normalizedValues) {
        for (const rule of FEATURE_RULES) {
            if (rule.patterns.some((pattern) => pattern.test(value))) {
                features.add(rule.label)
            }
        }

        if (!doorman) {
            for (const rule of DOORMAN_RULES) {
                if (rule.patterns.some((pattern) => pattern.test(value))) {
                    doorman = rule.label
                    break
                }
            }
        }
    }

    const hasElevator = normalizedValues.some((value) => {
        return /elevador/.test(value)
    })

    if (hasElevator) {
        features.add('Elevador')
    }

    return {
        features: [...features],
        hasElevator: hasElevator ? true : null,
        doorman,
    }
}
