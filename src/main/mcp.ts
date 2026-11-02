import { createServer, IncomingMessage, Server } from 'http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { DecisionStore } from './db'
import { buildServer } from './tools'

export const MCP_HOST = '127.0.0.1'
export const MCP_PORT = 3917
export const MCP_URL = `http://${MCP_HOST}:${MCP_PORT}/mcp`

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : undefined)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

// Stateless Streamable HTTP: a fresh server and transport for every request.
export function startMcpServer(store: DecisionStore, onChange: () => void): Promise<Server> {
  const http = createServer(async (req, res) => {
    if (req.url?.split('?')[0] !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end()
      return
    }
    try {
      const body = await readJson(req)
      const server = buildServer(store, onChange)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        enableDnsRebindingProtection: true,
        allowedHosts: [`${MCP_HOST}:${MCP_PORT}`, `localhost:${MCP_PORT}`]
      })
      res.on('close', () => {
        transport.close()
        server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      console.error('[whyspace mcp]', err)
      if (!res.headersSent) res.writeHead(500).end()
    }
  })

  return new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(MCP_PORT, MCP_HOST, () => resolve(http))
  })
}
