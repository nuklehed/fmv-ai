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
    // Try Ollama-native /api/tags first, fall back to /v1/models for OpenRouter/other proxies
    let response: Response | null = null
    try {
      response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
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
      response = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) })
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
        headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
    }

    const json = await response.json() as LLMData
    return { content: json.choices?.[0]?.message?.content || '' }
  }
}

/** Factory — returns the configured LLM client */
export function createLLMClient(): LLMClientInterface {
  return new OllamaLLMClient()
}
