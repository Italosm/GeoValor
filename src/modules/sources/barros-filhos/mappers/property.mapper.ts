import type { ScrapedProperty } from '../../../../common/types/scraper.js'

import { toCents, toNumber } from '../../../../common/utils/number.js'
import { extractPropertyFeatureSignals } from '../../../../common/utils/property-features.js'

import { detectAddressType } from '../../../../common/utils/addressType.js'
import type { RawBarrosFilhosProperty } from '../types/property.js'
import { PROVIDER } from '../constants/urls.js'

type Property = RawBarrosFilhosProperty

export function mapProperty(property: Property, url: string): ScrapedProperty {
    const address = property.imv_endereco
        ? property.imv_end_numero != null
            ? `${property.imv_endereco}, ${property.imv_end_numero}`
            : property.imv_endereco
        : null

    let rawPrice: unknown = property.imv_preco_venda

    const parsedSalePrice = toNumber(property.imv_preco_venda)

    const parsedRentPrice = toNumber(property.imv_preco_locacao)

    if (
        (parsedSalePrice === null || parsedSalePrice === 0) &&
        parsedRentPrice &&
        parsedRentPrice > 0
    ) {
        rawPrice = property.imv_preco_locacao
    }

    if (property.imv_ocultar_preco === true) {
        rawPrice = null
    }

    const featureTexts = [
        property.imv_obs,
        ...(property.comodidades ?? [])
            .map((item) => item.comodidade?.cmd_nome ?? null)
            .filter((value): value is string => Boolean(value)),
        ...(property.unavailableComodidades ?? [])
            .map((item) => item.cmd_nome ?? null)
            .filter((value): value is string => Boolean(value)),
    ]

    const featureSignals = extractPropertyFeatureSignals(featureTexts)

    return {
        provider: PROVIDER,
        externalId: property.imv_cod_gaia,
        active: property.imv_ativo ?? true,
        name: property.imv_nome_cond,
        title: property.imv_titulo,

        type: property.tipo_imovel?.timv_nome ?? property.imv_tipo ?? null,

        areaUseful: toNumber(property.imv_area_util),
        areaTotal: toNumber(property.imv_area_total),

        priceCents: toCents(rawPrice),

        iptuCents: toCents(property.imv_preco_iptu),

        condominiumFeeCents: toCents(property.imv_preco_cond),

        url,

        garages: property.imv_qtd_vagas,

        bedrooms: property.imv_qtd_dorm,

        bathrooms: property.imv_qtd_banheiros,

        suites: property.imv_qtd_suite,

        hasElevator: featureSignals.hasElevator,

        doorman: featureSignals.doorman,

        features: featureSignals.features,

        description: property.imv_obs,

        address: address
            ? {
                  address,
                  cep: null,
                  type: detectAddressType(address),

                  neighborhood: property.imv_bairro,

                  city: property.imv_cidade,

                  state: property.imv_estado,

                  latitude: toNumber(property.imv_latitude),

                  longitude: toNumber(property.imv_longitude),
              }
            : null,
    }
}
