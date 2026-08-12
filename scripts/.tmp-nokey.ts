// Simulates a deployment whose Variables tab has no AI_* entries.
delete process.env.AI_DRIVER
delete process.env.AI_API_KEY
process.env.DOTENV_CONFIG_PATH = '/nonexistent'
await import('./assistant-doctor')
