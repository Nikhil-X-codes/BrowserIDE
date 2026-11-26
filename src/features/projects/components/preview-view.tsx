"use client";

import ky from "ky";
import { toast } from "sonner";
import { useState } from "react";
import { Allotment } from "allotment";
import {
  Loader2Icon,
  TerminalSquareIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWebContainer } from "@/features/preview/hooks/use-webcontainer";
import { PreviewSettingsPopover } from "@/features/preview/components/preview-settings-popover";
import { PreviewTerminal } from "@/features/preview/components/preview-terminal";
import {
  useConversations,
  useCreateConversation,
} from "@/features/conversations/hooks/use-conversations";
import { DEFAULT_CONVERSATION_TITLE } from "@/features/conversations/constants";

import { Button } from "@/components/ui/button";

import { useProject } from "../hooks/use-projects";

import { Id } from "../../../../convex/_generated/dataModel";

const MAX_TERMINAL_LOG_CHARS = 4000;
const MAX_TERMINAL_LOG_LINES = 50;

export const PreviewView = ({ projectId }: { projectId: Id<"projects"> }) => {
  const project = useProject(projectId);
  const conversations = useConversations(projectId);
  const createConversation = useCreateConversation();
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalTab, setTerminalTab] = useState<"logs" | "shell">("logs");
  const [isFixing, setIsFixing] = useState(false);

  const {
    status,
    previewUrl,
    error,
    restart,
    terminalOutput,
    shellOutput,
    sendShellInput,
  } = useWebContainer({
    projectId,
    enabled: true,
    settings: project?.settings,
  });

  const isLoading = status === "booting" || status === "installing";

  const handleFixWithAi = async () => {
    if (isFixing || !error) return;
    setIsFixing(true);

    try {
      let conversationId = conversations?.[0]?._id ?? null;
      if (!conversationId) {
        conversationId = await createConversation({
          projectId,
          title: DEFAULT_CONVERSATION_TITLE,
        });
      }

      const recentLogs = terminalOutput
        .split("\n")
        .slice(-MAX_TERMINAL_LOG_LINES)
        .join("\n")
        .slice(-MAX_TERMINAL_LOG_CHARS);

      const diagnosticPrompt = [
        "The WebContainer preview failed with the following error. Please inspect the relevant project files and fix the issue:",
        "",
        `Error: ${error}`,
        "",
        "Recent terminal output:",
        "```",
        recentLogs || "(no terminal output)",
        "```",
      ].join("\n");

      await ky.post("/api/messages", {
        json: {
          conversationId,
          message: diagnosticPrompt,
        },
      });

      toast.success("Sent error logs to AI assistant");
    } catch {
      toast.error("Failed to send error to AI assistant");
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-8.75 flex items-center border-b bg-sidebar shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          disabled={isLoading}
          onClick={restart}
          title="Restart container"
        >
          <RefreshCwIcon className="size-3" />
        </Button>

        <div className="flex-1 h-full flex items-center px-3 bg-background border-x text-xs text-muted-foreground truncate font-mono">
          {isLoading && (
            <div className="flex items-center gap-1.5">
              <Loader2Icon className="size-3 animate-spin" />
              {status === "booting" ? "Starting..." : "Installing..."}
            </div>
          )}
          {previewUrl && <span className="truncate">{previewUrl}</span>}
          {!isLoading && !previewUrl && !error && <span>Ready to preview</span>}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-full rounded-none"
          title="Toggle terminal"
          onClick={() => setShowTerminal((value) => !value)}
        >
          <TerminalSquareIcon className="size-3" />
        </Button>
        <PreviewSettingsPopover
          projectId={projectId}
          initialValues={project?.settings}
          onSave={restart}
        />
      </div>

      <div className="flex-1 min-h-0">
        <Allotment vertical>
          <Allotment.Pane>
            {error && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <AlertTriangleIcon className="size-6" />
                  <p className="text-sm font-medium">{error}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={restart}>
                      <RefreshCwIcon className="size-4" />
                      Restart
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleFixWithAi}
                      disabled={isFixing}
                    >
                      {isFixing ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <SparklesIcon className="size-4" />
                      )}
                      Fix with AI
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isLoading && !error && (
              <div className="size-full flex items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 max-w-md mx-auto text-center">
                  <Loader2Icon className="size-6 animate-spin" />
                  <p className="text-sm font-medium">Installing...</p>
                </div>
              </div>
            )}

            {previewUrl && (
              <iframe
                src={previewUrl}
                className="size-full border-0"
                title="Preview"
              />
            )}
          </Allotment.Pane>

          {showTerminal && (
            <Allotment.Pane minSize={100} maxSize={500} preferredSize={200}>
              <div className="h-full flex flex-col bg-background border-t">
                <div className="h-7 flex items-center justify-between px-3 text-xs text-muted-foreground border-b border-border/50 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <TerminalSquareIcon className="size-3" />
                    <span>Terminal</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTerminalTab("logs")}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs cursor-pointer transition-colors",
                        terminalTab === "logs"
                          ? "bg-accent text-foreground"
                          : "hover:text-foreground"
                      )}
                    >
                      Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalTab("shell")}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs cursor-pointer transition-colors",
                        terminalTab === "shell"
                          ? "bg-accent text-foreground"
                          : "hover:text-foreground"
                      )}
                    >
                      Shell (jsh)
                    </button>
                  </div>
                </div>
                {terminalTab === "logs" ? (
                  <PreviewTerminal key="logs" output={terminalOutput} />
                ) : (
                  <PreviewTerminal
                    key="shell"
                    output={shellOutput}
                    onInput={sendShellInput}
                  />
                )}
              </div>
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
    </div>
  );
};
