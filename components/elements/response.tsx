"use client";

import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { rehypeMathDirection } from "@/lib/rehype-math-direction";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto",
        className
      )}
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[rehypeKatex, rehypeMathDirection]}
      components={{
        a: ({ node, ...props }) => (
          <a
            className="font-medium underline underline-offset-4 text-primary"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        h1: ({ node, ...props }) => (
          <h1 className="scroll-m-20 text-3xl font-extrabold tracking-tight lg:text-4xl mt-8 mb-4 first:mt-0" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight first:mt-0 mt-8 mb-4" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mt-6 mb-3" {...props} />
        ),
        h4: ({ node, ...props }) => (
          <h4 className="scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-3" {...props} />
        ),
        p: ({ node, ...props }) => (
          <p className="leading-7 [&:not(:first-child)]:mt-6" {...props} />
        ),
        ul: ({ node, ...props }) => (
          <ul className="my-6 ml-6 list-disc [&>li]:mt-2" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="my-6 ml-6 list-decimal [&>li]:mt-2" {...props} />
        ),
        blockquote: ({ node, ...props }) => (
          <blockquote className="mt-6 border-l-2 pl-6 italic text-muted-foreground" {...props} />
        ),
        table: ({ node, ...props }) => (
          <div className="my-6 w-full overflow-y-auto">
            <Table {...props} />
          </div>
        ),
        thead: ({ node, ...props }) => <TableHeader {...props} />,
        tbody: ({ node, ...props }) => <TableBody {...props} />,
        tr: ({ node, ...props }) => <TableRow {...props} />,
        th: ({ node, ...props }) => <TableHead {...props} />,
        td: ({ node, ...props }) => <TableCell {...props} />,
      }}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
