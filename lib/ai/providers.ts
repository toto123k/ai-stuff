import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { customProvider, extractReasoningMiddleware, wrapLanguageModel } from 'ai'
import { isTestEnvironment } from '../constants'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const openrouter = createOpenRouter({
  apiKey: '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',
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
