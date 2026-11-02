// Hosted storage for the lab: the whole log is one JSON file in a private Vercel Blob store.
// Fine for one person testing. Writes use the file's ETag, so two saves at once retry
// instead of overwriting each other.
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import { DEFAULT_PROJECT } from '../src/shared/decisions'
import type { Decision, DecisionFilter, Project } from '../src/shared/decisions'
import type { WhyspaceStore } from '../src/main/tools'

const PATH = 'whyspace/db.json'

interface Data {
  projects: Project[]
  decisions: Decision[]
  active_project_id: number
  next_project_id: number
  next_decision_id: number
}

function seed(): Data {
  return {
    projects: [{ id: 1, ...DEFAULT_PROJECT, created_at: now() }],
    decisions: [],
    active_project_id: 1,
    next_project_id: 2,
    next_decision_id: 1
  }
}

function now(): string {
  return new Date().toISOString()
}

async function load(): Promise<{ data: Data; etag?: string }> {
  const res = await get(PATH, { access: 'private', useCache: false })
  if (!res || res.statusCode !== 200) return { data: seed() }
  return { data: JSON.parse(await new Response(res.stream).text()), etag: res.blob.etag }
}

async function save(data: Data, etag?: string): Promise<void> {
  await put(PATH, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : {})
  })
}

// Read, change, write; start over if someone else wrote in between.
async function mutate<T>(change: (data: Data) => T): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, etag } = await load()
    const result = change(data)
    try {
      await save(data, etag)
      return result
    } catch (err) {
      if (!(err instanceof BlobPreconditionFailedError)) throw err
    }
  }
  throw new Error('Too many conflicting writes, try again')
}

export class BlobStore implements WhyspaceStore {
  async projects(): Promise<Project[]> {
    return (await load()).data.projects
  }

  async findProject(name: string): Promise<Project | undefined> {
    const key = name.trim().toLowerCase()
    return (await this.projects()).find((p) => p.name.toLowerCase() === key)
  }

  async activeProject(): Promise<Project | undefined> {
    const { data } = await load()
    return data.projects.find((p) => p.id === data.active_project_id)
  }

  async list(filter: DecisionFilter = {}): Promise<Decision[]> {
    const part = filter.part?.trim().toLowerCase()
    return (await load()).data.decisions
      .filter((d) => !filter.project_id || d.project_id === filter.project_id)
      .filter((d) => !part || d.part.toLowerCase().includes(part))
      .filter((d) => !filter.status || d.status === filter.status)
      .sort((a, b) => b.id - a.id)
  }

  record(input: {
    project_id: number
    part: string
    title: string
    why: string
    source: string
    made_by: string
  }): Promise<Decision> {
    return mutate((data) => {
      // Status is fixed here: anything recorded starts as an AI guess.
      const d: Decision = {
        id: data.next_decision_id++,
        project_id: input.project_id,
        part: input.part.trim(),
        title: input.title.trim(),
        why: input.why.trim(),
        status: 'ai_guess',
        source: input.source,
        made_by: input.made_by,
        confirmed_by: null,
        created_at: now(),
        confirmed_at: null
      }
      data.decisions.push(d)
      return d
    })
  }

  // The rest is only reachable through the app API, never through MCP.

  confirm(id: number, by: string): Promise<Decision | undefined> {
    return mutate((data) => {
      const d = data.decisions.find((x) => x.id === id)
      if (d && d.status === 'ai_guess') {
        d.status = 'confirmed'
        d.confirmed_by = by
        d.confirmed_at = now()
      }
      return d
    })
  }

  createProject(name: string, brief = ''): Promise<Project> {
    return mutate((data) => {
      const p: Project = {
        id: data.next_project_id++,
        name: name.trim(),
        brief: brief.trim(),
        created_at: now()
      }
      data.projects.push(p)
      data.active_project_id = p.id
      return p
    })
  }

  updateProject(
    id: number,
    fields: { name?: string; brief?: string }
  ): Promise<Project | undefined> {
    return mutate((data) => {
      const p = data.projects.find((x) => x.id === id)
      if (p) {
        p.name = (fields.name ?? p.name).trim()
        p.brief = (fields.brief ?? p.brief).trim()
      }
      return p
    })
  }

  setActiveProject(id: number): Promise<void> {
    return mutate((data) => {
      if (data.projects.some((p) => p.id === id)) data.active_project_id = id
    })
  }
}
