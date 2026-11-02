// The hosted Whyspace server (Vercel function).
// - /mcp/<MCP_TOKEN>  the MCP server Claude connects to (load context, record, list; never confirm)
// - /app/...          the API whyspace-lab uses, with APP_TOKEN in a header (confirm lives here)
import type { IncomingMessage, ServerResponse } from 'http'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { buildServer } from '../src/main/tools'
import { BlobStore } from './blob-store'

const store = new BlobStore()

function json(data: unknown, status = 200): Response {
  return Response.json(data ?? null, { status })
}

async function handleMcp(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  // Stateless: a fresh server and transport for every request.
  const server = buildServer(store)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}

async function handleApp(req: Request, route: string[]): Promise<Response> {
  const body = req.method === 'GET' ? {} : await req.json().catch(() => ({}))
  const [resource, id, action] = route

  if (resource === 'projects' && !id && req.method === 'GET') {
    const [projects, active] = await Promise.all([store.projects(), store.activeProject()])
    return json({ projects, activeId: active?.id })
  }
  if (resource === 'projects' && !id && req.method === 'POST') {
    return json(await store.createProject(String(body.name ?? ''), String(body.brief ?? '')))
  }
  if (resource === 'projects' && id && !action && req.method === 'PATCH') {
    return json(await store.updateProject(Number(id), body))
  }
  if (resource === 'projects' && action === 'select' && req.method === 'POST') {
    await store.setActiveProject(Number(id))
    return json({ ok: true })
  }
  if (resource === 'decisions' && !id && req.method === 'GET') {
    const q = new URL(req.url).searchParams
    return json(
      await store.list({
        project_id: q.get('project_id') ? Number(q.get('project_id')) : undefined,
        part: q.get('part') ?? undefined,
        status: (q.get('status') as 'ai_guess' | 'confirmed' | null) ?? undefined
      })
    )
  }
  // Confirming only exists here, behind the app token. MCP has no route to it.
  if (resource === 'decisions' && action === 'confirm' && req.method === 'POST') {
    return json(await store.confirm(Number(id), String(body.by ?? '').trim() || 'Someone'))
  }
  return json({ error: 'not found' }, 404)
}

async function handle(req: Request): Promise<Response> {
  try {
    // .vercel/output/config.json routes every path to /api?path=<original path>.
    const url = new URL(req.url)
    const path = url.searchParams.get('path') ?? url.pathname
    const [area, ...rest] = path.split('/').filter(Boolean)

    if (area === 'mcp') {
      if (!process.env.MCP_TOKEN || rest[0] !== process.env.MCP_TOKEN) {
        return new Response('Not found', { status: 404 })
      }
      return await handleMcp(req)
    }
    if (area === 'app') {
      if (
        !process.env.APP_TOKEN ||
        req.headers.get('x-whyspace-app-token') !== process.env.APP_TOKEN
      ) {
        return json({ error: 'unauthorized' }, 401)
      }
      return await handleApp(req, rest)
    }
    return new Response('Whyspace lab server', { status: 200 })
  } catch (err) {
    console.error(err)
    return json({ error: String(err) }, 500)
  }
}

// Vercel's Node launcher calls (req, res); turn that into a web Request and back.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost'
  const request = new Request(`https://${host}${req.url}`, {
    method: req.method,
    headers,
    body:
      chunks.length && req.method !== 'GET' && req.method !== 'HEAD'
        ? Buffer.concat(chunks)
        : undefined
  })
  const response = await handle(request)
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}
