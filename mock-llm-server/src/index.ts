import express, { Request, Response } from 'express'

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3001

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', (req: Request, res: Response) => {
    const { stream = false, messages, metadata } = req.body

    // Log the incoming request metadata
    console.log('\n========== INCOMING REQUEST ==========')
    console.log('Messages:', JSON.stringify(messages, null, 2))
    if (metadata?.selectedFiles && metadata.selectedFiles.length > 0) {
        console.log('\n🗂️  SELECTED LIBRARY ITEMS:')
        console.log(JSON.stringify(metadata.selectedFiles, null, 2))
    } else {
        console.log('\n📭 No library items selected')
    }
    console.log('=======================================\n')

    const responseContent = 'goo goo gaa gaa'

    if (stream) {
        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const chunk = {
            id: 'chatcmpl-mock',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [
                {
                    index: 0,
                    delta: { content: responseContent },
                    finish_reason: null,
                },
            ],
        }

        res.write(`data: ${JSON.stringify(chunk)}\n\n`)

        const doneChunk = {
            id: 'chatcmpl-mock',
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                },
            ],
        }

        res.write(`data: ${JSON.stringify(doneChunk)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
    } else {
        // Non-streaming response
        const response = {
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'mock-model',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: responseContent,
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
        }

        res.json(response)
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
