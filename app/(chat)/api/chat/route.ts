import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import { createResumableStreamContext, type ResumableStreamContext } from "resumable-stream";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { z } from "zod";
import { auth, type UserType } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastContextById
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch {
      return;
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 }
);

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({ waitUntil: after });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(" > Resumable streams are disabled due to missing REDIS_URL");
      } else {
        console.error(error);
      }
    }
  }
  return globalStreamContext;
}

const PositionSchema = z.object({
  lat: z.number().finite().gte(-90).lte(90),
  lon: z.number().finite().gte(-180).lte(180)
});

const LosParamsSchema = z.object({
  positions: z.array(PositionSchema).min(2),
  radius: z.number().finite().positive(),
  height: z.number().finite().positive()
});

type LosParams = z.infer<typeof LosParamsSchema>;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;
    const messageCount = await getMessageCountByUserId({ id: session.user.id, differenceInHours: 24 });
    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const chat = await getChatById({ id });
    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const title = await generateTitleFromUserMessage({ message });
      await saveChat({ id, userId: session.user.id, title, visibility: selectedVisibilityType });
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);
    const requestHints: RequestHints = { longitude, latitude, city, country };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date()
        }
      ]
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;

    const rawInputBufferByToolCallId = new Map<string, string>();
    const parsedInputByToolCallId = new Map<string, LosParams>();

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const losTool = tool<unknown, any>({
          description: "Evaluate line-of-sight feasibility along a path using positions, a radius, and a sensor height. Returns a stub.",
          inputSchema: z.any(),
          onInputStart: ({ toolCallId }) => {
            rawInputBufferByToolCallId.set(toolCallId, "");
            parsedInputByToolCallId.delete(toolCallId);
          },
          onInputDelta: ({ toolCallId, inputTextDelta }) => {
            if (typeof inputTextDelta === "string") {
              const current = rawInputBufferByToolCallId.get(toolCallId) ?? "";
              rawInputBufferByToolCallId.set(toolCallId, current + inputTextDelta);
            }
          },
          onInputAvailable: ({ toolCallId, input }) => {
            const raw = typeof input === "string" ? input : rawInputBufferByToolCallId.get(toolCallId);
            if (!raw) return;
            if (raw.length > 256_000) return;
            try {
              const candidate = JSON.parse(raw);
              const parsed = LosParamsSchema.safeParse(candidate);
              if (parsed.success) parsedInputByToolCallId.set(toolCallId, parsed.data);
            } catch {}
          },
          execute: async (input, ctx) => {
            const hasStructured = input && typeof input === "object" && Object.keys(input as object).length > 0;
            const resolved: LosParams = hasStructured
              ? LosParamsSchema.parse(input)
              : (() => {
                  const key = ctx.toolCallId ?? Array.from(parsedInputByToolCallId.keys()).at(-1) ?? "";
                  const fallback = parsedInputByToolCallId.get(key);
                  if (!fallback) throw new Error("invalid_input");
                  return fallback;
                })();
            const responseId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
            const pathLength = resolved.positions.length;
            const start = resolved.positions[0];
            const end = resolved.positions[pathLength - 1];
            return {
              id: responseId,
              status: "stub",
              summary: "LOS calculation placeholder",
              input: resolved,
              metadata: { pathLength, start, end, timestamp: new Date().toISOString() }
            };
          }
        });

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_transform: smoothStream({ chunking: "word" }),
          tools: { los: losTool },
          experimental_telemetry: { isEnabled: isProductionEnvironment, functionId: "stream-text" },
          onFinish: async ({ usage }) => {
            try {
              const providers = await getTokenlensCatalog();
              const modelId = myProvider.languageModel(selectedChatModel).modelId;
              if (!modelId || !providers) {
                finalMergedUsage = usage;
                dataStream.write({ type: "data-usage", data: finalMergedUsage });
                return;
              }
              const summary = getUsage({ modelId, usage, providers });
              finalMergedUsage = { ...usage, ...summary, modelId } as AppUsage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            } catch {
              finalMergedUsage = usage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            }
          }
        });

        result.consumeStream();
        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map(currentMessage => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id
          }))
        });
        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({ chatId: id, context: finalMergedUsage });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }
        }
      },
      onError: () => "Oops, an error occurred!"
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    if (error instanceof Error && error.message?.includes("AI Gateway requires a valid credit card on file to service requests")) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }
    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }
  const chat = await getChatById({ id });
  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }
  const deletedChat = await deleteChatById({ id });
  return Response.json(deletedChat, { status: 200 });
}
