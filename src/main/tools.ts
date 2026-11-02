// The Whyspace MCP tools. Shared by the local server in the Electron app (mcp.ts)
// and the hosted server on Vercel (server/api.ts).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Decision, DecisionFilter, Project } from '../shared/decisions'

type MaybePromise<T> = T | Promise<T>

// What the tools need from storage. The local SQLite store and the hosted store both provide it.
export interface WhyspaceStore {
  projects(): MaybePromise<Project[]>
  findProject(name: string): MaybePromise<Project | undefined>
  activeProject(): MaybePromise<Project | undefined>
  list(filter?: DecisionFilter): MaybePromise<Decision[]>
  record(input: {
    project_id: number
    part: string
    title: string
    why: string
    source: string
    made_by: string
  }): MaybePromise<Decision>
}

// The rules Claude follows. Sent as server instructions, and also returned by
// get_project_context, because the Claude app gives tool results more weight.
const RULES = `How to work with Whyspace:
- Whyspace is this project's decision log: what was decided, and why.
- Whenever the user settles a decision (a choice about what to build, how it looks, how it works, or what to drop), call record_decision right away. Do not wait to be asked, and do not ask permission first. Then tell the user in one short line that you saved it as an AI guess.
- A decision is a choice the user commits to ("let's do X", "we're going with X", "X, because Y"). Questions, options you are still weighing, and your own suggestions the user hasn't accepted are not decisions.
- If a new decision replaces an earlier one, record the new one and mention the earlier decision's number in the why.
- Before answering anything about what was decided before, call list_decisions instead of guessing or relying on memory.
- You cannot confirm decisions. Only a person can, with the Confirm button in the Whyspace app.`

const INSTRUCTIONS = `Call get_project_context at the start of any conversation about the user's project, design or product work, before your first answer.\n\n${RULES}`

function describe(d: Decision): string {
  const status =
    d.status === 'confirmed' ? `confirmed by ${d.confirmed_by}` : 'AI guess, not confirmed yet'
  return `#${d.id} [${d.part}] ${d.title}\n  Why: ${d.why}\n  Status: ${status} · recorded by ${d.made_by} on ${d.created_at.slice(0, 10)}`
}

function text(value: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: value }] }
}

const projectArg = z
  .string()
  .optional()
  .describe(
    'Whyspace project name. Leave empty to use the project selected in the Whyspace app, unless the user or your project instructions name one.'
  )

export function buildServer(store: WhyspaceStore, onChange: () => void = () => {}): McpServer {
  const server = new McpServer(
    { name: 'whyspace', version: '0.3.0' },
    { instructions: INSTRUCTIONS }
  )

  // Finds the named project, or the one selected in the app.
  async function resolve(name?: string): Promise<Project | string> {
    if (name?.trim()) {
      const found = await store.findProject(name)
      if (found) return found
      const names = (await store.projects()).map((p) => p.name)
      return `No Whyspace project called "${name}". Projects: ${names.join(', ')}.`
    }
    return (await store.activeProject()) ?? 'No project is selected in the Whyspace app.'
  }

  server.registerTool(
    'get_project_context',
    {
      title: 'Load project context',
      description:
        "Call this first, at the start of every conversation about the user's project, design or product work, before answering. Returns the project brief, recent decisions and how to log new ones. Also call it when the user switches to another project.",
      inputSchema: { project: projectArg },
      annotations: { readOnlyHint: true }
    },
    async ({ project }) => {
      const p = await resolve(project)
      if (typeof p === 'string') return { ...text(p), isError: true }
      const recent = (await store.list({ project_id: p.id })).slice(0, 20)
      const others = (await store.projects()).filter((o) => o.id !== p.id).map((o) => o.name)
      return text(
        [
          `Project: ${p.name}`,
          `Brief: ${p.brief || '(no brief yet)'}`,
          others.length ? `Other Whyspace projects: ${others.join(', ')}` : '',
          '',
          recent.length
            ? `Recent decisions (newest first):\n${recent.map(describe).join('\n\n')}`
            : 'No decisions recorded yet.',
          '',
          RULES
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n')
      )
    }
  )

  server.registerTool(
    'record_decision',
    {
      title: 'Record a decision',
      description:
        "Save a decision to the project's Whyspace log the moment the user settles it, without being asked. Use it whenever the user commits to a choice about what to build, how it looks or works, or what to drop. Saved as an AI guess until a person confirms it in the Whyspace app.",
      inputSchema: {
        part: z
          .string()
          .min(1)
          .describe('Which part of the project, e.g. "home page", "onboarding", "brand"'),
        title: z.string().min(1).describe('What was decided, in one sentence'),
        why: z.string().min(1).describe("The reason, in the user's words where possible"),
        project: projectArg
      }
    },
    async ({ part, title, why, project }) => {
      const p = await resolve(project)
      if (typeof p === 'string') return { ...text(p), isError: true }
      const d = await store.record({
        project_id: p.id,
        part,
        title,
        why,
        source: 'claude',
        made_by: 'Claude'
      })
      onChange()
      return text(`Saved to ${p.name} as an AI guess:\n${describe(d)}`)
    }
  )

  server.registerTool(
    'list_decisions',
    {
      title: 'List decisions',
      description:
        "Read the project's decision log, newest first. Call it before answering any question about what was decided, instead of relying on memory. Each decision shows whether it is an AI guess or confirmed, and by whom.",
      inputSchema: {
        part: z.string().optional().describe('Only decisions about this part of the project'),
        status: z
          .enum(['ai_guess', 'confirmed'])
          .optional()
          .describe('Only AI guesses, or only confirmed ones'),
        project: projectArg
      },
      annotations: { readOnlyHint: true }
    },
    async ({ part, status, project }) => {
      const p = await resolve(project)
      if (typeof p === 'string') return { ...text(p), isError: true }
      const rows = await store.list({ project_id: p.id, part, status })
      return text(
        rows.length
          ? `${p.name}:\n\n${rows.map(describe).join('\n\n')}`
          : `No decisions in ${p.name} match.`
      )
    }
  )

  // Shows up in Claude's + menu, for starting a chat with the context loaded.
  server.registerPrompt(
    'start',
    {
      title: 'Start with Whyspace',
      description: 'Load the selected project and log decisions as you go'
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Load my Whyspace project context, then log decisions with Whyspace as we settle them.'
          }
        }
      ]
    })
  )

  return server
}
