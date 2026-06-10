/**
 * LLM Client — provider interface for AI inference.
 * Swappable: default implementation targets Ollama-compatible endpoints,
 * but any provider implementing this interface can be injected.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMResponse {
  content: string
}

interface LLMChoice {
  message?: { content?: string }
}

interface LLMData {
  choices?: LLMChoice[]
}

export interface LLMClientInterface {
  chat(messages: ChatMessage[], options?: Record<string, unknown>): Promise<LLMResponse>
  healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }>
}

/** Default Ollama-compatible implementation */
class OllamaLLMClient implements LLMClientInterface {
  private baseUrl: string
  private model: string

  constructor(baseUrl: string = process.env.LLM_BASE_URL || 'http://localhost:11434', model: string = process.env.LLM_MODEL || 'qwen3.6-35b-a3b') {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.model = model
  }

  async healthCheck(): Promise<{ ok: boolean; model?: string; error?: string }> {
    const apiKey = process.env.LLM_API_KEY?.trim()
    const authHeaders: Record<string, string> = {}
    if (apiKey) {
      authHeaders['Authorization'] = `Bearer ${apiKey}`
    }

    // Try Ollama-native /api/tags first, fall back to /v1/models for OpenRouter/other proxies
    let response: Response | null = null
    try {
      response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000), headers: authHeaders })
      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string }> }
        const modelLoaded = data.models?.some(m => m.name.includes(this.model))
        return {
          ok: true,
          model: this.model,
          ...(modelLoaded ? {} : { error: `Ollama is running but model '${this.model}' is not loaded. Run: ollama pull ${this.model}` })
        }
      }
    } catch {
      // /api/tags failed — try OpenRouter-style endpoint
    }

    // Fallback: try /v1/models (OpenRouter, LM Studio, etc.)
    try {
      response = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000), headers: authHeaders })
      if (response.ok) {
        return {
          ok: true,
          model: this.model,
          error: 'Server reachable but not Ollama — health check cannot verify model availability'
        }
      }
    } catch {
      // /v1/models also failed
    }

    // Final fallback: try a minimal chat call to verify the endpoint works at all
    try {
      response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(3000)
      })
      if (response.ok || response.status === 400 || response.status === 401) {
        // 400 = bad request (model may not exist but endpoint works)
        // 401 = auth required (endpoint works)
        return { ok: true, model: this.model }
      }
    } catch {
      // Chat endpoint also failed
    }

    return {
      ok: false,
      error: response ? `Server responded with ${response.status}` : 'Could not reach the LLM server at any endpoint'
    }
  }

  async chat(messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    const endpoint = `${this.baseUrl}/v1/chat/completions`
    const requestBody = JSON.stringify({
      model: this.model,
      messages,
      stream: false,
      temperature: 0.1
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiKey = process.env.LLM_API_KEY?.trim()
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    console.log(`[LLM] Request → ${endpoint}`)
    console.log(`[LLM] Model: ${this.model}`)
    console.log(`[LLM] Messages: ${messages.length} (${messages.map(m => m.role).join(', ')})`)
    console.log(`[LLM] Auth: ${apiKey ? 'Bearer token configured' : 'no auth'}`)
    // Log prompt lengths (not full content — can be huge for CV assessments)
    messages.forEach((m, i) => {
      console.log(`[LLM]   [${i}] ${m.role}: ${m.content.length} chars`) 
    })

    let response: Response
    try {
      // 5-minute timeout on LLM requests to prevent indefinite hangs
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: requestBody,
          signal: controller.signal
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      const networkError = err instanceof Error ? err.message : String(err)
      const isTimeout = networkError.includes('abort') || networkError.includes('timeout')
      if (isTimeout) {
        console.error(`[LLM] Request timed out after 5 minutes — ${endpoint}`)
        throw new Error(`LLM request timed out after 5 minutes. The server may be overloaded or the prompt is too large.`)
      }
      console.error(`[LLM] Network error — could not reach ${endpoint}`)
      console.error(`[LLM] Error: ${networkError}`)
      throw new Error(`Network error connecting to LLM at ${endpoint}: ${networkError}`)
    }

    const responseText = await response.text()
    console.log(`[LLM] Response ← status: ${response.status} ${response.statusText}, body: ${responseText.length} chars`)
    if (response.ok) {
      // Truncate long responses for log readability
      const snippet = responseText.length > 2000 ? responseText.substring(0, 2000) + '...[truncated]' : responseText
      console.log(`[LLM] Body: ${snippet}`)
    } else {
      console.error(`[LLM] Error body: ${responseText.substring(0, 1000)}`)
    }

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
    }

    const json = JSON.parse(responseText) as LLMData
    const content = json.choices?.[0]?.message?.content || ''
    console.log(`[LLM] Parsed content: ${content.length} chars`)
    return { content }
  }
}

/** Factory — returns the configured LLM client */
export function createLLMClient(): LLMClientInterface {
  return new OllamaLLMClient()
}
