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
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!response.ok) throw new Error(`Ollama responded with ${response.status}`)
      const data = await response.json() as { models?: Array<{ name: string }> }
      const modelLoaded = data.models?.some(m => m.name.includes(this.model))
      return {
        ok: true,
        model: this.model,
        ...(modelLoaded ? {} : { error: `Ollama is running but model '${this.model}' is not loaded. Run: ollama pull ${this.model}` })
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to reach Ollama'
      }
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
