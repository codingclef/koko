import fs from 'node:fs'
import path from 'node:path'

const migrationsDirectory = path.join(process.cwd(), 'supabase/migrations')

export function readLatestMigrationMatching(pattern: RegExp): string {
  const files = fs.readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort().reverse()

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8')
    pattern.lastIndex = 0
    if (pattern.test(sql)) return sql
  }

  throw new Error(`No migration matches ${pattern}`)
}
