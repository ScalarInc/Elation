import { buildApp } from './app'
import { loadConfig } from './config'
import { flushSentry, initSentry } from './lib/sentry'

const config = loadConfig()
initSentry(config)
const app = await buildApp(config)

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down')
  try {
    await app.close()
    await flushSentry()
    process.exit(0)
  } catch (err) {
    app.log.error({ err }, 'error during shutdown')
    process.exit(1)
  }
}
process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error({ err }, 'failed to start')
  await flushSentry()
  process.exit(1)
}
