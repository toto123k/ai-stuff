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
      'chat-model': openrouter('deepseek/deepseek-v3.2'),
      'title-model': openrouter('deepseek/deepseek-v3.2'),

    }
  })
