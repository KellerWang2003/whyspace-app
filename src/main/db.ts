import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import initSqlJs, { Database } from 'sql.js'
import { DEFAULT_PROJECT } from '../shared/decisions'
import type { Decision, DecisionFilter, Project } from '../shared/decisions'

export type { Decision, DecisionFilter, Project }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  brief TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  part TEXT NOT NULL,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ai_guess' CHECK (status IN ('ai_guess', 'confirmed')),
  source TEXT NOT NULL,
  made_by TEXT NOT NULL,
  confirmed_by TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

// Round 2 started with a "Whyspace" project. If it was never edited, swap it for the test project.
const OLD_DEFAULT_BRIEF_START = 'Whyspace is a desktop app that keeps one thread'

// sql.js keeps the database in memory, so every write is saved back to the file.
export class DecisionStore {
  private constructor(
    private db: Database,
    private file: string
  ) {}

  static async open(file: string): Promise<DecisionStore> {
    const SQL = await initSqlJs()
    const db = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()
    db.run(SCHEMA)
    const store = new DecisionStore(db, file)
    store.migrate()
    store.save()
    return store
  }

  // Round 1 databases have no projects: add the column and file old decisions under Whyspace.
  private migrate(): void {
    const columns = this.db.exec('PRAGMA table_info(decisions)')[0].values.map((c) => c[1])
    if (!columns.includes('project_id')) {
      this.db.run('ALTER TABLE decisions ADD COLUMN project_id INTEGER REFERENCES projects(id)')
    }
    if (this.projects().length === 0)
      this.createProject(DEFAULT_PROJECT.name, DEFAULT_PROJECT.brief)
    const old = this.findProject('Whyspace')
    if (old?.brief.startsWith(OLD_DEFAULT_BRIEF_START) && !this.findProject(DEFAULT_PROJECT.name)) {
      this.updateProject(old.id, DEFAULT_PROJECT)
    }
    const first = this.projects()[0]
    this.db.run('UPDATE decisions SET project_id = ? WHERE project_id IS NULL', [first.id])
    if (!this.activeProject()) this.setActiveProject(first.id)
  }

  projects(): Project[] {
    return this.query<Project>('SELECT * FROM projects ORDER BY id', [])
  }

  project(id: number): Project | undefined {
    return this.query<Project>('SELECT * FROM projects WHERE id = ?', [id])[0]
  }

  findProject(name: string): Project | undefined {
    return this.query<Project>('SELECT * FROM projects WHERE name = ? COLLATE NOCASE', [
      name.trim()
    ])[0]
  }

  createProject(name: string, brief = ''): Project {
    this.db.run('INSERT INTO projects (name, brief, created_at) VALUES (?, ?, ?)', [
      name.trim(),
      brief.trim(),
      now()
    ])
    const project = this.project(this.lastId())!
    this.save()
    return project
  }

  updateProject(id: number, fields: { name?: string; brief?: string }): Project | undefined {
    const current = this.project(id)
    if (!current) return undefined
    this.db.run('UPDATE projects SET name = ?, brief = ? WHERE id = ?', [
      (fields.name ?? current.name).trim(),
      (fields.brief ?? current.brief).trim(),
      id
    ])
    this.save()
    return this.project(id)
  }

  // The project selected in the window. Claude's decisions go here unless it names another.
  activeProject(): Project | undefined {
    const row = this.db.exec("SELECT value FROM settings WHERE key = 'active_project_id'")[0]
    return row ? this.project(Number(row.values[0][0])) : undefined
  }

  setActiveProject(id: number): void {
    this.db.run(
      "INSERT INTO settings (key, value) VALUES ('active_project_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [String(id)]
    )
    this.save()
  }

  record(input: {
    project_id: number
    part: string
    title: string
    why: string
    source: string
    made_by: string
  }): Decision {
    // Status is fixed here: anything recorded starts as an AI guess.
    this.db.run(
      `INSERT INTO decisions (project_id, part, title, why, status, source, made_by, created_at)
       VALUES (?, ?, ?, ?, 'ai_guess', ?, ?, ?)`,
      [
        input.project_id,
        input.part.trim(),
        input.title.trim(),
        input.why.trim(),
        input.source,
        input.made_by,
        now()
      ]
    )
    const id = this.lastId()
    this.save()
    return this.get(id)!
  }

  list(filter: DecisionFilter = {}): Decision[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (filter.project_id) {
      where.push('project_id = ?')
      params.push(filter.project_id)
    }
    if (filter.part) {
      where.push('lower(part) LIKE ?')
      params.push(`%${filter.part.trim().toLowerCase()}%`)
    }
    if (filter.status) {
      where.push('status = ?')
      params.push(filter.status)
    }
    const sql = `SELECT * FROM decisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`
    return this.query<Decision>(sql, params)
  }

  get(id: number): Decision | undefined {
    return this.query<Decision>('SELECT * FROM decisions WHERE id = ?', [id])[0]
  }

  confirm(id: number, by: string): Decision | undefined {
    this.db.run(
      `UPDATE decisions SET status = 'confirmed', confirmed_by = ?, confirmed_at = ?
       WHERE id = ? AND status = 'ai_guess'`,
      [by, now(), id]
    )
    this.save()
    return this.get(id)
  }

  private lastId(): number {
    return this.db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
  }

  private query<T>(sql: string, params: (string | number)[]): T[] {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    stmt.free()
    return rows
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, Buffer.from(this.db.export()))
  }
}

function now(): string {
  return new Date().toISOString()
}
