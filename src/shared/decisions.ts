// Types shared by the main process, preload and window.
export type DecisionStatus = 'ai_guess' | 'confirmed'

export interface Project {
  id: number
  name: string
  brief: string
  created_at: string
}

export interface Decision {
  id: number
  project_id: number
  part: string
  title: string
  why: string
  status: DecisionStatus
  source: string
  made_by: string
  confirmed_by: string | null
  created_at: string
  confirmed_at: string | null
}

export interface DecisionFilter {
  project_id?: number
  part?: string
  status?: DecisionStatus
}

export interface ServerStatus {
  mode: 'local' | 'hosted'
  running: boolean
  url: string
  error?: string
  dbPath: string
}

// A made-up project to test with, so tests aren't about Whyspace itself.
export const DEFAULT_PROJECT = {
  name: 'Tidewater Coffee',
  brief:
    'Website redesign for Tidewater, a small coffee roaster in Pasadena. Goals: sell coffee subscriptions online, tell the story of where the beans come from, and work well on phones. Audience: local regulars and people buying coffee as a gift.'
}
