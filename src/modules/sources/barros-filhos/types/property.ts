export interface RawBarrosFilhosProperty {
    imv_cod_gaia: string
    imv_ativo?: boolean
    imv_nome_cond: string | null
    imv_titulo: string | null
    imv_tipo: string | null
    tipo_imovel?: {
        timv_nome: string
        id: number
        createdAt?: string
    } | null
    timv_nome: string | null
    imv_area_util: number | string | null
    imv_area_total?: number | string | null

    imv_preco_venda: number | string | null
    imv_preco_locacao?: number | string | null
    imv_preco_iptu: number | string | null
    imv_preco_cond: number | null
    imv_ocultar_preco?: boolean

    imv_qtd_vagas: number | null
    imv_qtd_dorm: number | null
    imv_qtd_banheiros: number | null
    imv_qtd_suite: number | null

    imv_obs: string | null

    imv_endereco: string | null
    imv_end_numero: number | string | null
    imv_bairro: string | null
    imv_cidade: string | null
    imv_estado: string | null

    imv_latitude: number | string | null
    imv_longitude: number | string | null

    comodidades?: Array<{
        comodidade?: {
            cmd_nome?: string | null
        } | null
    }>

    unavailableComodidades?: Array<{
        cmd_nome?: string | null
    }>
}
