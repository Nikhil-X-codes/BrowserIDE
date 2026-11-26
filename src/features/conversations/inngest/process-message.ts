import { createAgent, openai, createNetwork } from '@inngest/agent-kit';

import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { FAST_GROQ_MODEL, groqComplete } from "@/lib/groq";
import { api } from "../../../../convex/_generated/api";
import { 
  CODING_AGENT_SYSTEM_PROMPT, 
  TITLE_GENERATOR_SYSTEM_PROMPT
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createReadFilesTool } from './tools/read-files';
import { createListFilesTool } from './tools/list-files';
import { createUpdateFileTool } from './tools/update-file';
import { createCreateFilesTool } from './tools/create-files';
import { createCreateFolderTool } from './tools/create-folder';
import { createRenameFileTool } from './tools/rename-file';
import { createDeleteFilesTool } from './tools/delete-files';
import { createScrapeUrlsTool } from './tools/scrape-urls';

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  listFiles: () => "Listing project files",
  readFiles: (input) =>
    `Reading ${Array.isArray(input.fileIds) ? `${input.fileIds.length} file(s)` : "files"}`,
  updateFile: () => "Updating file",
  createFiles: (input) =>
    `Creating ${Array.isArray(input.files) ? `${input.files.length} file(s)` : "files"}`,
  createFolder: (input) =>
    `Creating folder ${typeof input.name === "string" ? input.name : ""}`.trim(),
  renameFile: (input) =>
    `Renaming to ${typeof input.newName === "string" ? input.newName : "item"}`,
  deleteFiles: (input) =>
    `Deleting ${Array.isArray(input.fileIds) ? `${input.fileIds.length} item(s)` : "items"}`,
  scrapeUrls: (input) =>
    `Scraping ${Array.isArray(input.urls) ? `${input.urls.length} URL(s)` : "URLs"}`,
};

function wrapToolWithProgress<T extends {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any, opts: any) => any;
}>(
  tool: T,
  { internalKey, messageId }: { internalKey: string; messageId: Id<"messages"> }
): T {
  const originalHandler = tool.handler;
  return {
    ...tool,
    handler: async (input, opts) => {
      const stepId = `${tool.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const formatLabel = TOOL_LABELS[tool.name];
      const label = formatLabel
        ? formatLabel((input ?? {}) as Record<string, unknown>)
        : `Running ${tool.name}`;

      try {
        await convex.mutation(api.system.upsertMessageStep, {
          internalKey,
          messageId,
          step: { id: stepId, tool: tool.name, label, status: "running" },
        });
      } catch {
        // Progress reporting must not break tool execution
      }

      const result = await originalHandler(input, opts);
      const isError = typeof result === "string" && result.startsWith("Error");

      try {
        await convex.mutation(api.system.upsertMessageStep, {
          internalKey,
          messageId,
          step: {
            id: stepId,
            tool: tool.name,
            label,
            status: isError ? "error" : "completed",
          },
        });
      } catch {
        // Progress reporting must not break tool execution
      }

      return result;
    },
  };
}

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.CLOUDAIIDE_CONVEX_INTERNAL_KEY;

      // Update the message with error content
      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content:
              "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
          });
        });
      }
    }
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const { 
      messageId, 
      conversationId,
      projectId,
      message
    } = event.data as MessageEvent;

    const internalKey = process.env.CLOUDAIIDE_CONVEX_INTERNAL_KEY; 

    if (!internalKey) {
      throw new NonRetriableError("CLOUDAIIDE_CONVEX_INTERNAL_KEY is not configured");
    }

    // TODO: Check if this is needed
    await step.sleep("wait-for-db-sync", "1s");

    // Get conversation for title generation check
    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    // Fetch recent messages for conversation context
    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    // Build system prompt with conversation history (exclude the current processing message)
    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    // Filter out the current processing message and empty messages
    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== ""
    );

    if (contextMessages.length > 0) {
      const historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");

      systemPrompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${historyText}\n\n## Current Request:\nRespond ONLY to the user's new message below. Do not repeat or reference your previous responses.`;
    }

    // Generate conversation title if it's still the default
    const shouldGenerateTitle =
      conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      try {
        const title = await step.run("generate-title", async () => {
          return await groqComplete({
            system: TITLE_GENERATOR_SYSTEM_PROMPT,
            prompt: message,
            model: FAST_GROQ_MODEL,
            temperature: 0,
            maxTokens: 50,
          });
        });

        if (title) {
          await step.run("update-conversation-title", async () => {
            await convex.mutation(api.system.updateConversationTitle, {
              internalKey,
              conversationId,
              title,
            });
          });
        }
      } catch {
        // Non-fatal: keep default title and continue to the coding agent
      }
    }

    // Create the coding agent with file tools
    const codingAgent = createAgent({
      name: "BrowserIDE",
      description: "An expert AI coding assistant",
      system: systemPrompt,
       model: openai({
        // GPT-OSS is used (not Llama) because the coding agent depends on
        // reliable function calling: Llama 3.x on Groq frequently emits
        // malformed tool calls (`<function=...>`) that Groq rejects, which
        // surfaced as HTTP 500s. GPT-OSS produces valid JSON tool calls.
        model: "openai/gpt-oss-120b",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        // Groq free tier caps this model at 8k tokens/minute, and rejects
        // (HTTP 413) any single request where prompt + max_completion_tokens
        // exceeds that. The agent's prompt grows as it reads files into
        // context, so keep the completion budget low to leave ~6k of room
        // for those reads. Trade-off: a single file write is capped at
        // ~2k tokens (~150 lines); larger generations need Groq's paid tier.
        defaultParameters: { temperature: 0.3, max_completion_tokens: 2000 },
       }),
       tools: [
        createListFilesTool({ internalKey, projectId }),
        createReadFilesTool({ internalKey }),
        createUpdateFileTool({ internalKey }),
        createCreateFilesTool({ projectId, internalKey }),
        createCreateFolderTool({ projectId, internalKey }),
        createRenameFileTool({ internalKey }),
        createDeleteFilesTool({ internalKey }),
        createScrapeUrlsTool(),
       ].map((tool) => wrapToolWithProgress(tool, { internalKey, messageId })),
    });

    // Create network with single agent
    const network = createNetwork({
      name: "BrowserIDE-network",
      agents: [codingAgent],
      maxIter: 20,
      router: ({ network }) => {
        const lastResult = network.state.results.at(-1);
        const hasTextResponse = lastResult?.output.some(
          (m) => m.type === "text" && m.role === "assistant"
        );
        const hasToolCalls = lastResult?.output.some(
          (m) => m.type === "tool_call"
        );

        // The model may output text alongside tool calls.
        // Only stop if there's text WITHOUT tool calls (final response)
        if (hasTextResponse && !hasToolCalls) {
          return undefined;
        }
        return codingAgent;
      }
    });

    // Run the agent
    const result = await network.run(message);

    // Extract the assistant's text response from the last agent result
    const lastResult = result.state.results.at(-1);
    const textMessage = lastResult?.output.find(
      (m) => m.type === "text" && m.role === "assistant"
    );

    let assistantResponse =
      "I processed your request. Let me know if you need anything else!";

    if (textMessage?.type === "text") {
      assistantResponse =
        typeof textMessage.content === "string"
          ? textMessage.content
          : textMessage.content.map((c) => c.text).join("");
    }

    // Update the assistant message with the response (this also sets status to completed)
    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      })
    });

    return { success: true, messageId, conversationId };
  }
);

