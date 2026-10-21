import { runProjectHarness } from './project-harness.js'

async function main(): Promise<void> {
    await runProjectHarness()
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
