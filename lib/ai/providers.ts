import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai'
import { isTestEnvironment } from '../constants'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const openrouter = createOpenRouter({
  apiKey: "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",
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.APP_PUBLIC_URL ?? 'http://localhost:3000',
    'X-Title': process.env.APP_PUBLIC_NAME ?? 'App'
  }
})

export const myProvider = isTestEnvironment
  ? (() => {
      const { artifactModel, chatModel, reasoningModel, titleModel } = require('./models.mock')
      return customProvider({
        languageModels: {
          'chat-model': chatModel,
          'title-model': titleModel,
        }
      })
    })()
  : customProvider({
      languageModels: {
        'chat-model': openrouter('ai21/jamba-large-1.7'),
        'title-model': openrouter('ai21/jamba-large-1.7'),
        
      }
    })
