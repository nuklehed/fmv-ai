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
}

/** Default Ollama-compatible implementation */
class OllamaLLMClient implements LLMClientInterface {
  private baseUrl: string
  private model: string

  constructor(baseUrl: string = process.env.LLM_BASE_URL || 'http://localhost:11434', model: string = process.env.LLM_MODEL || 'qwen2.5:32b') {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.model = model
  }

  async chat(messages: ChatMessage[], _options?: Record<string, unknown>): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false
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
