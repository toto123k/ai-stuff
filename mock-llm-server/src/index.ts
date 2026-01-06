import express, { Request, Response } from 'express'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3001

// Initialize LangChain ChatOpenAI with OpenRouter configuration
// We use the DeepSeek model by default as it's cost-effective and good for testing
const chat = new ChatOpenAI({
    modelName: 'deepseek/deepseek-chat',
    openAIApiKey: process.env.OPENROUTER_API_KEY || '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',
    configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Mock LLM Server',
        }
    },
    streaming: true,
    temperature: 0.7,
})

app.post('/v1/chat/completions', async (req: Request, res: Response) => {
    const { stream = false, messages, metadata } = req.body

    try {
        // Log metadata
        console.log('\n========== INCOMING REQUEST ==========')
        if (metadata?.selectedFiles && metadata.selectedFiles.length > 0) {
            console.log('🗂️  SELECTED LIBRARY ITEMS:')
            console.log(JSON.stringify(metadata.selectedFiles, null, 2))
        } else {
            console.log('📭 No library items selected')
        }
        console.log('Messages count:', messages?.length)

        // Convert messages to LangChain format
        const langChainMessages = messages.map((m: any) => {
            if (m.role === 'user') return new HumanMessage(m.content)
            if (m.role === 'system') return new SystemMessage(m.content)
            return new AIMessage(m.content)
        })

        if (!stream) {
            console.log('Processing non-streaming request...')
            const response = await chat.invoke(langChainMessages)

            res.json({
                id: 'chatcmpl-mock-' + Date.now(),
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: 'mock-model-proxy',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: response.content,
                        },
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    // Mock usage
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0
                }
            })
            console.log('Response sent.')
        } else {
            console.log('Processing streaming request...')

            // Set headers for SSE
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')

            const stream = await chat.stream(langChainMessages)

            for await (const chunk of stream) {
                const content = chunk.content
                if (content) {
                    const responseChunk = {
                        id: 'chatcmpl-mock-' + Date.now(),
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: 'mock-model-proxy',
                        choices: [
                            {
                                index: 0,
                                delta: { content },
                                finish_reason: null,
                            },
                        ],
                    }
                    res.write(`data: ${JSON.stringify(responseChunk)}\n\n`)
                }
            }

            // Send done signal
            res.write('data: [DONE]\n\n')
            res.end()
            console.log('Stream finished.')
        }
        console.log('=======================================\n')

    } catch (error) {
        console.error('Error processing request:', error)
        res.status(500).json({ error: 'Internal Server Error', details: error })
    }
})

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
})

app.listen(PORT, () => {
    console.log(`Mock LLM server running on port ${PORT}`)
    console.log(`OpenAI-compatible endpoint: http://localhost:${PORT}/v1/chat/completions`)
})
