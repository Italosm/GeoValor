import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from '../logger.js'

const logger = createLogger('project-harness')

type AgentEntry = {
    id: string
    file: string
    purpose: string
}

type SkillEntry = {
    id: string
    path: string
}

type Manifest = {
    version: number
    project: string
    agents: AgentEntry[]
    subagents: AgentEntry[]
    skills: SkillEntry[]
}

type CheckResult = {
    name: string
    ok: boolean
    details?: string
}

const HARN_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(HARN_DIR, '../../../..')

async function fileExists(relativePath: string): Promise<boolean> {
    try {
        await access(path.join(ROOT_DIR, relativePath))
        return true
    } catch {
        return false
    }
}

async function readJson<T>(relativePath: string): Promise<T> {
    const fullPath = path.join(ROOT_DIR, relativePath)
    const content = await readFile(fullPath, 'utf8')

    return JSON.parse(content) as T
}

function pass(name: string, details?: string): CheckResult {
    return { name, ok: true, details }
}

function fail(name: string, details: string): CheckResult {
    return { name, ok: false, details }
}

async function checkManifest(): Promise<CheckResult> {
    if (!(await fileExists('.agents/manifest.json'))) {
        return fail('manifest', 'Missing .agents/manifest.json')
    }

    const manifest = await readJson<Manifest>('.agents/manifest.json')

    if (manifest.version !== 1) {
        return fail('manifest', 'Expected manifest version 1')
    }

    if (!manifest.project) {
        return fail('manifest', 'Missing project name')
    }

    if (!manifest.agents.length) {
        return fail('manifest', 'No agents declared')
    }

    if (!manifest.subagents.length) {
        return fail('manifest', 'No subagents declared')
    }

    if (!manifest.skills.length) {
        return fail('manifest', 'No skills declared')
    }

    for (const agent of [...manifest.agents, ...manifest.subagents]) {
        if (!agent.id || !agent.file || !agent.purpose) {
            return fail('manifest', `Invalid agent entry: ${JSON.stringify(agent)}`)
        }

        if (!(await fileExists(agent.file))) {
            return fail('manifest', `Missing agent file: ${agent.file}`)
        }
    }

    for (const skill of manifest.skills) {
        if (!skill.id || !skill.path) {
            return fail('manifest', `Invalid skill entry: ${JSON.stringify(skill)}`)
        }

        if (!(await fileExists(path.join(skill.path, 'SKILL.md')))) {
            return fail('manifest', `Missing skill file: ${skill.path}/SKILL.md`)
        }

        if (
            !(await fileExists(path.join(skill.path, 'agents/openai.yaml')))
        ) {
            return fail(
                'manifest',
                `Missing skill metadata: ${skill.path}/agents/openai.yaml`,
            )
        }
    }

    return pass(
        'manifest',
        `Found ${manifest.agents.length} agents, ${manifest.subagents.length} subagents, and ${manifest.skills.length} skills`,
    )
}

async function checkProjectConventions(): Promise<CheckResult> {
    const requiredPaths = [
        'src/common/infrastructure/harness/project-harness.ts',
        'src/common/infrastructure/harness/run-harness.ts',
        'src/modules/sources/barros-filhos',
        'src/modules/sources/legislar',
    ]

    for (const requiredPath of requiredPaths) {
        if (!(await fileExists(requiredPath))) {
            return fail('conventions', `Missing required path: ${requiredPath}`)
        }
    }

    return pass('conventions', 'Core project structure is present')
}

async function checkPackageScripts(): Promise<CheckResult> {
    const packageJson = await readJson<{
        scripts?: Record<string, string>
    }>('package.json')

    const scripts = packageJson.scripts ?? {}
    const requiredScripts = ['harness', 'lint', 'typecheck', 'check']
    const missing = requiredScripts.filter((script) => !scripts[script])

    if (missing.length > 0) {
        return fail('scripts', `Missing scripts: ${missing.join(', ')}`)
    }

    return pass('scripts', 'Harness scripts are registered')
}

export async function runProjectHarness(): Promise<void> {
    const checks = [
        await checkManifest(),
        await checkProjectConventions(),
        await checkPackageScripts(),
    ]

    const failures = checks.filter((check) => !check.ok)
    const label = failures.length === 0 ? 'HARNESS OK' : 'HARNESS FAILED'

    logger.info(label)

    for (const check of checks) {
        const status = check.ok ? 'PASS' : 'FAIL'
        const details = check.details ? ` - ${check.details}` : ''
        const message = `${status} ${check.name}${details}`

        if (check.ok) {
            logger.info(message)
        } else {
            logger.error(message)
        }
    }

    if (failures.length > 0) {
        throw new Error('Project harness detected structural issues.')
    }
}
