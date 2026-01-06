import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { customProvider } from 'ai'
import type { LanguageModel } from 'ai'
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
class MockLanguageModel {
  readonly specificationVersion = 'v2';
  readonly provider = 'mock-llm';
  readonly modelId = 'mock-model';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportedUrls = [];
  readonly supportsImageUrls = false;
  readonly supportsStructuredOutputs = false;

  private baseURL = process.env.MOCK_LLM_URL ?? 'http://localhost:3001';

  // Helper to convert prompt to simple messages format
  private promptToMessages(prompt: unknown): { role: string; content: string }[] {
    if (!Array.isArray(prompt)) return [{ role: 'user', content: 'hello' }];
    return prompt
      .filter((m: unknown) => {
        const msg = m as Record<string, unknown>;
        return msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system';
      })
      .map((m: unknown) => {
        const msg = m as Record<string, unknown>;
        const content = Array.isArray(msg.content)
          ? (msg.content as unknown[]).map((c: unknown) => {
            const part = c as Record<string, unknown>;
            return 'text' in part ? String(part.text) : '';
          }).join('')
          : String(msg.content ?? '');
        return { role: String(msg.role), content };
      });
  }

  async doGenerate(options: { prompt: unknown; experimental_providerMetadata?: Record<string, unknown>; providerMetadata?: Record<string, unknown> }) {
    const messages = this.promptToMessages(options.prompt);

    console.log('options', options);
    // Extract provider metadata from call options (passed via streamText experimental_providerMetadata)
    const metadata = options.providerMetadata ?? options.experimental_providerMetadata;
    const providerSpecificMetadata = (metadata as Record<string, unknown>)?.['mock-llm'] as Record<string, unknown> | undefined;
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
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? 'goo goo gaa gaa';

    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      content: [{ type: 'text', text }],
      warnings: [],
    };
  }

  async doStream(options: { prompt: unknown; providerOptions?: Record<string, unknown>; providerMetadata?: Record<string, unknown> }) {
    const messages = this.promptToMessages(options.prompt);


    // Extract provider metadata from call options
    const metadata = options.providerOptions;
    console.log('metadata', metadata);

    const providerSpecificMetadata = (metadata as Record<string, unknown>)?.['mock-llm'] as Record<string, unknown> | undefined;
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
    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? 'goo goo gaa gaa';

    return {
      stream: new ReadableStream({
        start(controller) {
          // Emit text delta chunk
          controller.enqueue({ type: 'text-delta', textDelta: text });
          // Emit finish chunk
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 5 }
          });
          controller.close();
        },
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    };
  }
}

const createMockServerModel = (): LanguageModel => {
  return new MockLanguageModel() as unknown as LanguageModel;
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


