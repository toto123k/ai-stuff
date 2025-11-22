import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    'X-Title': 'YourAppName',
    'HTTP-Referer': 'https://your.domain'
  }
})

export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string
  name: string
  description: string
  slug: string
}


import chatModelsData from './models.json'

export const chatModels: ChatModel[] = chatModelsData
