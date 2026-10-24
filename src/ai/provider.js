// ─────────────────────────────────────────────────────────────
//  LLM provider abstraction.
//
//  The app never talks to a model directly — it talks to a
//  `provider`. A provider is any object with:
//
//      complete({ system, user, history }) => Promise<{ text, provider }>
//
//  `text` is the raw model output. You are expected to extract and
//  validate JSON from it yourself: models wrap JSON in prose, in code
//  fences, or return something that is not JSON at all.
//
//  Two providers ship with the repo:
//    • mock  — deterministic, offline, answers the prompts listed in
//              fixtures/ai-eval/*.json. Used by graders. The default.
//    • http  — YOURS. Call any LLM API you like (Anthropic, OpenAI,
//              Gemini, Ollama, …) with plain fetch(). Read the endpoint,
//              key and model from the VITE_AI_* env vars (.env.example).
//
//  Do not hard-code a vendor anywhere else: everything outside this
//  file must behave identically with either provider.
// ─────────────────────────────────────────────────────────────
import { createMockProvider } from './mockProvider.js'

/**
 * @typedef {{ role: 'user' | 'assistant', content: string }} ChatTurn
 * @typedef {{ system: string, user: string, history?: ChatTurn[] }} CompletionRequest
 * @typedef {{ text: string, provider: string }} CompletionResponse
 * @typedef {{ name: string, complete: (req: CompletionRequest) => Promise<CompletionResponse> }} Provider
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}

/** @returns {Provider} */
export function createHttpProvider(config = {}) {
    const endpoint = config.endpoint ?? env.VITE_AI_ENDPOINT
    const apiKey = config.apiKey ?? env.VITE_AI_API_KEY
    const model = config.model ?? env.VITE_AI_MODEL

    return {
        name: 'http',
        async complete(request) {
            if (!endpoint || !apiKey || !model) throw new Error('AUTH_ERROR: HTTP provider needs endpoint, API key and model')
            const messages = [{ role: 'system', content: request.system }, ...(request.history || []), { role: 'user', content: request.user }]
            const body = { model, messages, temperature: 0, response_format: { type: 'json_object' } }
            const send = async (payload) => {
                let response
                try { response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) }
                catch { throw new Error('NETWORK_ERROR: Could not reach AI provider') }
                if (!response.ok) {
                    const retry = response.headers.get('retry-after')
                    const kind = response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'PROVIDER_ERROR' : 'PROVIDER_ERROR'
                    throw new Error(`${kind}: HTTP ${response.status}${retry ? ` (retry after ${retry}s)` : ''}`)
                }
                const data = await response.json()
                const text = data?.choices?.[0]?.message?.content
                if (typeof text !== 'string') throw new Error('PROVIDER_ERROR: response has no choices[0].message.content')
                return text
            }
            try { return { text: await send(body), provider: 'http' } }
            catch (error) {
                if (!String(error.message).includes('HTTP 400')) throw error
                const retry = { ...body }; delete retry.response_format
                return { text: await send(retry), provider: 'http' }
            }
        },
    }
}

/**
 * Pick a provider from VITE_AI_PROVIDER. Unknown values fall back to mock
 * so the app always boots.
 * @returns {Provider}
 */
export function createProvider(kind = env.VITE_AI_PROVIDER || 'mock') {
    if (kind === 'http') return createHttpProvider()
    return createMockProvider()
}
