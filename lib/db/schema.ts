import { sql, type InferSelectModel } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AppUsage } from "../usage";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  lastContext: jsonb("lastContext").$type<AppUsage | null>(),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// 1. Define the Custom Ltree Type
// Drizzle doesn't natively support ltree, so we define it here.
const ltree = customType<{ data: string }>({
  dataType() {
    return 'ltree';
  },
});

// 2. Define Enums
export const objectTypeEnum = pgEnum('object_type', ['file', 'folder']);
export const rootTypeEnum = pgEnum('root_type', ['personal', 'organizational', 'personal-temporary']);
export const permTypeEnum = pgEnum('perm_type', ['read', 'write', 'admin', 'owner']);

export type ObjectType = (typeof objectTypeEnum.enumValues)[number];
export type RootType = (typeof rootTypeEnum.enumValues)[number];
export type PermType = (typeof permTypeEnum.enumValues)[number];

// Spreadsheet metadata types
export interface SpreadsheetColumnSchema {
  originalName: string;
  name: string;
  type: 'string' | 'int64' | 'float64' | 'boolean' | 'timestamp';
  nullable: boolean;
}

export interface SpreadsheetSheetSchema {
  originalName: string;
  tableName: string;
  rowCount: number;
  columns: SpreadsheetColumnSchema[];
  partCount: number;
  totalBytes: number;
}

export interface SpreadsheetSchema {
  version: 1;
  convertedAt: string;
  compression: 'zstd';
  compressionLevel: number;
  totalBytes: number;
  conversionTimeMs: number;
  sheets: SpreadsheetSheetSchema[];
}

export interface FSObjectMetadata {
  spreadsheetSchema?: SpreadsheetSchema;
}

// 3. Filesystem Objects Table (The Tree)
export const fsObjects = pgTable('fs_objects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: objectTypeEnum('type').notNull(),
  path: ltree('path').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  // File metadata (nullable - only for files, not folders)
  expiresAt: timestamp('expires_at'),
  fileSize: bigint('file_size', { mode: 'number' }),
  mimeType: text('mime_type'),
  // Generic metadata JSONB for spreadsheet schema, etc.
  metadata: jsonb('metadata').$type<FSObjectMetadata | null>(),
}, (table) => ({
  pathGistIdx: index('path_gist_idx').using('gist', table.path),
  expiresAtIdx: index('fs_objects_expires_at_idx').on(table.expiresAt),
}));

export type FSObject = InferSelectModel<typeof fsObjects>;

export const fsRoots = pgTable('fs_roots', {
  id: serial('id').primaryKey(),
  rootFolderId: integer('root_folder_id').references(() => fsObjects.id).notNull(),
  type: rootTypeEnum('type').notNull(),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).default(52428800).notNull(), // 50MB default
}, (table) => ({
  typeIdx: index('fs_roots_type_idx').on(table.type),
}));

// 5. User Permissions Table
export const userPermissions = pgTable('user_permissions', {
  userId: uuid('user_id').references(() => user.id).notNull(),
  folderId: integer('folder_id').references(() => fsObjects.id).notNull(),
  permission: permTypeEnum('permission').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.folderId] }),
  userIdx: index('user_permissions_user_idx').on(table.userId),
}));

// 6. Chunks Table (for RAG)
export interface ChunkMetadata {
  pageId?: number;
  documentId?: string;
  path: string; // S3 path
}

export const chunks = pgTable('chunks', {
  id: serial('id').primaryKey(),
  fsObjectId: integer('fs_object_id').references(() => fsObjects.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  embedding: jsonb('embedding').$type<number[]>(), // Vector embedding for similarity search
  metadata: jsonb('metadata').$type<ChunkMetadata>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  fsObjectIdx: index('chunks_fs_object_idx').on(table.fsObjectId),
}));

export type Chunk = InferSelectModel<typeof chunks>;
