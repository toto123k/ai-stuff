import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { customProvider } from 'ai'
import type { LanguageModelV2, LanguageModelV2CallOptions, LanguageModelV2Prompt, LanguageModelV2Content, LanguageModelV2StreamPart } from '@ai-sdk/provider'
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

const useMockProvider = process.env.USE_MOCK_PROVIDER === 'true'

// Create a V1-spec mock model that calls the local mock server
// We use a class to allow passing providerOptions via streamText call options
// V1 Specification Implementation (AI SDK 3.0 uses V1 spec key)
class MockLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'mock-llm';
  readonly modelId = 'mock-model';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportedUrls = {};
  // checking previous error: "Property 'supportedUrls' is missing". 

  private baseURL = process.env.MOCK_LLM_URL ?? 'http://localhost:3001';

  // Convert AI SDK prompt to OpenAI/Mock server format
  private convertToProviderMessages(prompt: LanguageModelV2Prompt) {
    return prompt.map((message) => {
      switch (message.role) {
        case 'system':
          return { role: 'system', content: message.content };
        case 'user':
          return {
            role: 'user',
            content: message.content.map((part) => {
              if (part.type === 'text') return part.text;
              // @ts-ignore
              if (part.type === 'file') return `[File: ${part.data}]`;
              return '';
            }).join(''),
          };
        case 'assistant':
          return {
            role: 'assistant',
            content: message.content.map(part => {
              if (part.type === 'text') return part.text;
              return '';
            }).join('')
          }
        case 'tool':
          // Basic tool support in conversion
          return {
            role: 'tool',
            content: JSON.stringify(message.content)
          }
        default:
          return { role: 'user', content: '' };
      }
    });
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const messages = this.convertToProviderMessages(options.prompt);

    // Extract metadata
    const providerSpecificMetadata = ((options as any).providerMetadata as Record<string, unknown>)?.['mock-llm'] as Record<string, unknown> | undefined;
    const selectedFiles = providerSpecificMetadata?.selectedFiles ?? [];

    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: false,
        metadata: { selectedFiles }
      })
    });

    const data = await response.json() as { choices?: { message?: { content?: string } }[], usage?: { prompt_tokens?: number, completion_tokens?: number, total_tokens?: number } };
    const text = data.choices?.[0]?.message?.content ?? '';

    return {
      content: [{ type: 'text', text }] as LanguageModelV2Content[],
      finishReason: 'stop' as const,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      rawCall: { rawPrompt: null, rawSettings: {} },
      warnings: []
    };
  }

  async doStream(options: LanguageModelV2CallOptions) {
    const messages = this.convertToProviderMessages(options.prompt);

    const providerSpecificMetadata = (options.providerOptions)?.['mock-llm'] as Record<string, unknown> | undefined;
    const selectedFiles = providerSpecificMetadata?.selectedFiles ?? [];

    console.log('Selected files:', options);
    const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: true,
        metadata: { selectedFiles }
      })
    });

    if (!response.body) {
      throw new Error('No response body from mock server');
    }

    const stream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(this.createParser())
      .pipeThrough(this.createTransformer());

    return {
      stream,
      rawCall: { rawPrompt: null, rawSettings: {} },
    };
  }

  // Create a parser that splits the stream by newlines and removes "data: " prefix
  private createParser() {
    return new TransformStream<string, any>({
      transform(chunk, controller) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              controller.enqueue(json);
            } catch (e) {
              // ignore invalid JSON
            }
          }
        }
      }
    });
  }

  // Transform OpenAI chunks to AI SDK events
  private createTransformer() {
    return new TransformStream<any, LanguageModelV2StreamPart>({
      transform(chunk, controller) {
        // We only care about content deltas for now
        const content = chunk.choices?.[0]?.delta?.content;
        const id = chunk.id ?? 'unknown';

        if (content) {
          controller.enqueue({
            type: 'text-delta',
            delta: content,
            id
          });
        }

        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason) {
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          });
        }
      }
    });
  }
}

const createMockServerModel = (): LanguageModelV2 => {
  return new MockLanguageModel();
}

const getProvider = () => {
  if (isTestEnvironment) {
    const { artifactModel, chatModel, reasoningModel, titleModel } = require('./models.mock')
    return customProvider({
      languageModels: {
        'chat-model': chatModel,
        'title-model': titleModel,
      }
    })
  }

  if (useMockProvider) {
    const mockModel = createMockServerModel()
    return customProvider({
      languageModels: {
        'chat-model': mockModel,
        'title-model': mockModel,
      }
    })
  }

  return customProvider({
    languageModels: {
      'chat-model': openrouter('deepseek/deepseek-v3.2'),
      'title-model': openrouter('deepseek/deepseek-v3.2'),
    }
  })
}

export const myProvider = getProvider()


