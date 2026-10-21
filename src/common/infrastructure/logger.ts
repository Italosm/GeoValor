import pino from 'pino'
import logUpdate from 'log-update'
import chalk from 'chalk'
import { Writable } from 'stream'

type LogLevel = 'info' | 'debug' | 'error' | 'warn' | 'fatal' | 'trace'

const activeContexts = new Map<string, string>()
const updatableLevels: LogLevel[] = ['info', 'debug', 'trace']

function render() {
    const output = Array.from(activeContexts.values()).join('\n')
    if (output) {
        logUpdate(output)
    }
}

const levelColors: Record<LogLevel, (str: string) => string> = {
    info: chalk.green,
    debug: chalk.blue,
    trace: chalk.gray,
    warn: chalk.yellow,
    error: chalk.bold.red,
    fatal: chalk.bgRed.white.bold,
}

const customTransport = new Writable({
    write(chunk, _encoding, callback) {
        try {
            const log = JSON.parse(chunk.toString())
            const { level, time, msg, context, ...rest } = log
            const levelStr = pino.levels.labels[level] as LogLevel

            const timestamp = `[${new Date(time).toLocaleTimeString('en-GB')}]`
            const levelLabel = levelColors[levelStr]
                ? levelColors[levelStr](levelStr.toUpperCase())
                : levelStr.toUpperCase()
            const contextLabel = `([${context || 'system'}])`

            // Aplica CIANO na mensagem principal conforme você pediu
            const message = msg ? chalk.cyan(msg) : ''

            // Aplica CINZA nos metadados/objetos
            const data =
                Object.keys(rest).length > 0
                    ? ` ${chalk.gray(JSON.stringify(rest))}`
                    : ''

            const formatted = `${timestamp} ${levelLabel} ${contextLabel}: ${message}${data}`

            if (updatableLevels.includes(levelStr) && context) {
                activeContexts.set(context, formatted)
                render()
            } else {
                logUpdate.done()

                if (context && activeContexts.has(context)) {
                    activeContexts.delete(context)
                }

                const stream = level >= 40 ? process.stderr : process.stdout
                stream.write(formatted + '\n')

                render()
            }
        } catch (e) {
            console.error('Error processing log chunk:', e, chunk.toString())
        }
        callback()
    },
})

const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'debug', // Garantir debug em dev para ver inicializações
        base: {},
    },
    customTransport,
)

export const createLogger = (context: string) => {
    return logger.child({ context })
}

export default logger
