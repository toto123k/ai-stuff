import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const libraryItemPartSchema = z.object({
  type: z.enum(["library-item"]),
  itemId: z.string(),
  name: z.string(),
  folderId: z.number().optional(),
  isFile: z.boolean().optional(),
});

const partSchema = z.union([textPartSchema, filePartSchema, libraryItemPartSchema]);

// Selected library file for context
const selectedFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  folderId: z.number().optional(),
  isFile: z.boolean().optional(),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  selectedChatModel: z.enum(["chat-model", "chat-model-reasoning"]),
  selectedVisibilityType: z.enum(["public", "private"]),
  selectedFiles: z.array(selectedFileSchema).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
export type SelectedFile = z.infer<typeof selectedFileSchema>;
