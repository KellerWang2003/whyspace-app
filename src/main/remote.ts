// Talks to the hosted Whyspace server (server/api.ts) instead of the local SQLite file.
import type { Decision, DecisionFilter, Project } from '../shared/decisions'

export class RemoteStore {
  constructor(
    private baseUrl: string,
    private appToken: string
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/app${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-whyspace-app-token': this.appToken },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`Whyspace server: ${res.status} ${await res.text()}`)
    return res.json() as Promise<T>
  }

  async list(filter: DecisionFilter = {}): Promise<Decision[]> {
    const q = new URLSearchParams()
    for (const [key, value] of Object.entries(filter)) if (value) q.set(key, String(value))
    return this.call('GET', `/decisions?${q}`)
  }

  confirm(id: number, by: string): Promise<Decision | undefined> {
    return this.call('POST', `/decisions/${id}/confirm`, { by })
  }

  async projectsWithActive(): Promise<{ projects: Project[]; activeId?: number }> {
    return this.call('GET', '/projects')
  }

  createProject(name: string, brief: string): Promise<Project> {
    return this.call('POST', '/projects', { name, brief })
  }

  updateProject(id: number, fields: { name?: string; brief?: string }): Promise<Project> {
    return this.call('PATCH', `/projects/${id}`, fields)
  }

  async setActiveProject(id: number): Promise<void> {
    await this.call('POST', `/projects/${id}/select`)
  }
}
