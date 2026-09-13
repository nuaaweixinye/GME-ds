/** Authenticated local workflow transport and optional Python worker ownership. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

/** Fully resolved deployment settings; model input cannot alter these paths. */
export interface BackendOptions {
  /** Existing GME Test Agent checkout used as the worker directory. */
  backendRoot: string
  /** Python executable with the backend's dependencies installed. */
  pythonPath: string
  /** Backend JSON configuration, absolute or relative to backendRoot. */
  configFile: string
  /** API token file, absolute or relative to backendRoot. */
  tokenFile: string
  /** Backend TCP port on IPv4 loopback. */
  port: number
  /** Start an owned Python worker when the configured port refuses connections. */
  autoStart: boolean
  /** Deadline in milliseconds for one HTTP request including its body. */
  timeoutMs: number
  /** Deadline in milliseconds for an owned worker to become healthy. */
  startupTimeoutMs: number
  /** Maximum bytes retained from one HTTP response. */
  maxResponseBytes: number
}

/** HTTP acceptance is distinct from job completion. */
export interface BackendReply { httpStatus: number; data: JsonValue }

/** Own one connection and, only when started here, a local backend process. */
export class Backend {
  private ready: Promise<void> | undefined
  private token = ''
  private owned: SubprocessHandle | undefined
  private readonly lifetime = new AbortController()
  private readonly baseURL: string

  /** @param ctx - Optional subprocess provider. @param options - Trusted deployment. */
  constructor(private readonly ctx: Context, private readonly options: BackendOptions) {
    this.baseURL = `http://127.0.0.1:${options.port}`
  }

  /** Issue one request without retrying mutations.
   * @param method - Fixed operation verb.
   * @param path - Route assembled by the workflow tool.
   * @param body - Validated action data.
   * @param signal - Caller cancellation; does not cancel an accepted backend job.
   * @returns HTTP success and decoded backend result.
   */
  async request(method: 'GET' | 'POST', path: string, body: JsonValue | undefined, signal: AbortSignal): Promise<BackendReply> {
    signal.throwIfAborted()
    const ready = this.ready ??= this.connect().catch((error: unknown) => { this.ready = undefined; throw error })
    await new Promise<void>((done, reject) => {
      const cancel = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('GME request aborted')) }
      signal.addEventListener('abort', cancel, { once: true })
      void ready.then(done, reject).finally(() => { signal.removeEventListener('abort', cancel) })
      if (signal.aborted) cancel()
    })
    signal.throwIfAborted()
    try { return await this.fetchJson(method, path, body, signal) }
    catch (error) {
      const cause = error instanceof Error ? error.cause as NodeJS.ErrnoException | undefined : undefined
      if (cause?.code === 'ECONNREFUSED' && !this.owned) this.ready = undefined
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message.replaceAll(this.token, '[redacted]')}${method === 'POST' ? ' Submission may have reached the backend; query tasks before trying again.' : ''}`)
    }
  }

  private async connect(): Promise<void> {
    const tokenPath = resolve(this.options.backendRoot, this.options.tokenFile)
    try { this.token = (await readFile(tokenPath, 'utf8')).trim() }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !this.options.autoStart) throw new Error(`Cannot read GME API token file: ${tokenPath}`)
      await mkdir(dirname(tokenPath), { recursive: true })
      try { await writeFile(tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
      catch (writeError) { if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError }
      this.token = (await readFile(tokenPath, 'utf8')).trim()
    }
    if (this.token.length < 32) throw new Error('GME API token must contain at least 32 characters')
    if (await this.isReady()) return
    if (!this.options.autoStart) throw new Error('GME backend is unavailable. Start GME Test Agent or enable autoStart.')
    const subprocess = this.ctx.get('subprocess')
    if (!subprocess) throw new Error('GME autoStart requires a Harness subprocess provider')
    const executable = await subprocess.resolveExecutable(this.options.pythonPath)
    this.lifetime.signal.throwIfAborted()
    const child = this.owned = subprocess.spawn({
      argv: [executable, '-u', resolve(this.options.backendRoot, 'backend/run_backend.py'), '--config', resolve(this.options.backendRoot, this.options.configFile), '--host', '127.0.0.1', '--port', String(this.options.port)],
      cwd: this.options.backendRoot, env: { GME_AGENT_API_TOKEN: this.token },
      stdio: { stdin: 'ignore', stdout: { maxBytes: 32768 }, stderr: { maxBytes: 32768 } },
      graceMs: 5000, signal: this.lifetime.signal,
    })
    const startup = new AbortController()
    const startupSignal = AbortSignal.any([this.lifetime.signal, startup.signal, AbortSignal.timeout(this.options.startupTimeoutMs)])
    try {
      await Promise.race([
        child.done.then((result) => { throw new Error(`GME backend exited during startup (${String(result.exitCode)}). Check Python dependencies and config.local.json.`) }),
        this.waitReady(startupSignal),
      ])
    } catch (error) { child.terminate(); await child.waitForExit(); this.owned = undefined; throw error }
    finally { startup.abort() }
    const forgetExitedChild = () => {
      if (this.owned === child) { this.owned = undefined; this.ready = undefined }
    }
    void child.done.then(forgetExitedChild, forgetExitedChild)
  }

  private async waitReady(signal: AbortSignal): Promise<void> {
    while (true) {
      if (await this.isReady(signal)) return
      await delay(200, undefined, { signal })
    }
  }

  private async isReady(signal = this.lifetime.signal): Promise<boolean> {
    try {
      const { data } = await this.fetchJson('GET', '/api/health', undefined, signal)
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.authenticated !== true || data.ok !== true) throw new Error('The configured port is not an authenticated GME backend')
      return true
    } catch (error) {
      // Only connection refusal permits starting a new local server.
      const cause = error instanceof Error ? error.cause as NodeJS.ErrnoException | undefined : undefined
      if (cause?.code === 'ECONNREFUSED') return false
      throw error
    }
  }

  private async fetchJson(method: 'GET' | 'POST', path: string, body: JsonValue | undefined, signal: AbortSignal): Promise<BackendReply> {
    const response = await fetch(`${this.baseURL}${path}`, {
      method, redirect: 'error', headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(this.options.timeoutMs)]),
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error('GME backend returned an empty body')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > this.options.maxResponseBytes) throw new Error('GME response exceeds maxResponseBytes; inspect the backend report locally')
        chunks.push(chunk.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    let data: JsonValue
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonValue }
    catch { throw new Error(`GME backend returned invalid JSON (HTTP ${response.status})`) }
    if (!response.ok) {
      const detail = data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string' ? data.error.slice(0, 2000) : response.statusText
      throw new Error(`GME HTTP ${response.status}: ${detail.replaceAll(this.token, '[redacted]')}`)
    }
    return { httpStatus: response.status, data }
  }

  /** Stop only an owned child; a reused server survives plugin disposal. */
  async close(): Promise<void> {
    this.lifetime.abort()
    try { await this.ready } catch { /* Startup failure owns rollback. */ }
    if (this.owned) { this.owned.terminate(); await this.owned.waitForExit() }
  }
}
