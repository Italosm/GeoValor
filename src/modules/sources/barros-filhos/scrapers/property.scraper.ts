import { type Page } from 'playwright'

import { mapProperty } from '../mappers/property.mapper.js'

import type { ScrapedProperty } from '../../../../common/types/scraper.js'
import type { RawBarrosFilhosProperty } from '../types/property.js'
import { createLogger } from '../../../../common/infrastructure/logger.js'

type RawBarrosFilhosNextData = {
    props: {
        pageProps: {
            imovel: RawBarrosFilhosProperty | null
        }
    }
}

export async function scrapePropertyData(
    page: Page,
    url: string,
): Promise<{
    property: ScrapedProperty | null
    rawHtml: string | null
    retryable?: boolean
}> {
    const logger = createLogger('barros-filhos:property')
    try {
        const maxGotoAttempts = 3
        let lastGotoError: unknown = null

        for (let attempt = 1; attempt <= maxGotoAttempts; attempt++) {
            try {
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                })

                lastGotoError = null
                break
            } catch (err) {
                lastGotoError = err
                const message = String((err as any)?.message ?? err)

                if (
                    message.includes('interrupted by another navigation') ||
                    message.includes('Navigation to')
                ) {
                    logger.warn(
                        `Navegação interrompida para ${url}, tentativa ${attempt} de ${maxGotoAttempts}. Aguardando antes de retry...`,
                    )
                    await page.waitForTimeout(2000)
                    continue
                }

                logger.error({ err }, `Erro ao navegar para ${url}`)
                return { property: null, rawHtml: null, retryable: false }
            }
        }

        if (lastGotoError) {
            logger.error(
                { lastGotoError },
                `Falha ao navegar para ${url} depois de ${maxGotoAttempts} tentativas:`,
            )
            await page.waitForTimeout(2000)
            return { property: null, rawHtml: null, retryable: true }
        }

        const nextDataElement = page.locator('#__NEXT_DATA__')

        if ((await nextDataElement.count()) === 0) {
            logger.warn(`Tag __NEXT_DATA__ não encontrada para a URL: ${url}`)

            return { property: null, rawHtml: null, retryable: false }
        }

        const nextDataRaw = await nextDataElement.innerHTML()
        const nextData = JSON.parse(nextDataRaw) as RawBarrosFilhosNextData
        const propertyData = nextData.props?.pageProps?.imovel

        if (!propertyData) {
            logger.warn(
                `Objeto 'imovel' não encontrado no JSON para a URL: ${url}`,
            )
            return { property: null, rawHtml: null, retryable: false }
        }

        const mappedProperty = mapProperty(propertyData, url)

        if (mappedProperty) {
            if (
                propertyData.comodidades &&
                Array.isArray(propertyData.comodidades)
            ) {
                const comodidadeNames = propertyData.comodidades
                    .map((c: any) => c.comodidade?.cmd_nome)
                    .filter(Boolean)
                mappedProperty.features = comodidadeNames
            }
        }

        const rawHtml = mappedProperty ? await page.content() : null
        return { property: mappedProperty, rawHtml }
    } catch (error) {
        logger.error({ error }, `Erro ao tentar processar a URL ${url}:`)
        return { property: null, rawHtml: null, retryable: false }
    }
}
