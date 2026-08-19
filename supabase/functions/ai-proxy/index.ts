import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const GROQ_BASE = 'https://api.groq.com/openai/v1'

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(message: string, status = 400) {
  return corsResponse({ ok: false, error: message }, status)
}

async function validateGeminiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const resp = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    if (resp.ok) return { valid: true }
    const data = await resp.json().catch(() => ({}))
    return { valid: false, error: data.error?.message || `HTTP ${resp.status}` }
  } catch (e) {
    return { valid: false, error: String(e) }
  }
}

async function validateGroqKey(key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const resp = await fetch(`${GROQ_BASE}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
    })
    if (resp.ok) return { valid: true }
    const data = await resp.json().catch(() => ({}))
    return { valid: false, error: data.error?.message || `HTTP ${resp.status}` }
  } catch (e) {
    return { valid: false, error: String(e) }
  }
}

function sanitizePrompt(prompt: string): string {
  // Basic prompt injection prevention
  const injectionPatterns = [
    /ignore\s+(previous|above|all)\s+(instructions|prompts?|rules?)/i,
    /bypass\s+(safety|filter|guard|restriction)/i,
    /system\s*(prompt|instruction)/i,
    /roleplay|pretend\s+(to\s+be|you\s+are)/i,
    /\bDAN\b|jailbreak/i,
    /ignore\s+(this|that|the)\s+(prompt|instruction)/i,
  ]
  
  for (const pattern of injectionPatterns) {
    if (pattern.test(prompt)) {
      return null // Injection detected
    }
  }
  return prompt
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const { provider, prompt, action, apiKey } = await req.json()

    if (!provider || !prompt || !apiKey) {
      return errorResponse('Missing provider, prompt, or apiKey')
    }

    // Sanitize prompt for injection attempts
    const cleanPrompt = sanitizePrompt(prompt)
    if (cleanPrompt === null) {
      return errorResponse('Prompt injection detected', 400)
    }

    // Validate key first
    if (provider === 'gemini') {
      const validation = await validateGeminiKey(apiKey)
      if (!validation.valid) {
        return errorResponse(validation.error || 'Invalid Gemini API key', 401)
      }
    } else if (provider === 'groq') {
      const validation = await validateGroqKey(apiKey)
      if (!validation.valid) {
        return errorResponse(validation.error || 'Invalid Groq API key', 401)
      }
    } else {
      return errorResponse('Unsupported provider', 400)
    }

    // Proxy the actual request
    let targetUrl = ''
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    let body: Record<string, unknown> = {}

    if (provider === 'gemini') {
      if (action === 'validate') {
        targetUrl = `${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`
      } else if (action === 'generate') {
        targetUrl = `${GEMINI_BASE}/models/gemini-pro:generateContent?key=${encodeURIComponent(apiKey)}`
        body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        }
      } else {
        return errorResponse('Invalid action for Gemini')
      }
    } else if (provider === 'groq') {
      headers['Authorization'] = `Bearer ${apiKey}`
      if (action === 'validate') {
        targetUrl = `${GROQ_BASE}/models`
      } else if (action === 'generate') {
        targetUrl = `${GROQ_BASE}/chat/completions`
        body = {
          model: 'mixtral-8x7b-32768',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2048
        }
      } else {
        return errorResponse('Invalid action for Groq')
      }
    } else {
      return errorResponse('Unsupported provider')
    }

    const resp = await fetch(targetUrl, {
      method: action === 'validate' ? 'GET' : 'POST',
      headers,
      body: action === 'validate' ? undefined : JSON.stringify(body)
    })

    const data = await resp.json().catch(() => ({}))
    
    if (!resp.ok) {
      return errorResponse(data.error?.message || `Provider error: ${resp.status}`, resp.status)
    }

    return corsResponse({ ok: true, data })

  } catch (e) {
    console.error('[AI Proxy] Error:', e)
    return errorResponse('Internal server error', 500)
  }
}