"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Allotment } from "allotment";
import {
  FileIcon,
  FolderIcon,
  Loader2Icon,
  LockIcon,
  RefreshCwIcon,
  TerminalSquareIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePublicProject } from "@/features/projects/hooks/use-projects";
import { usePublicFiles } from "@/features/projects/hooks/use-files";
import { useWebContainer } from "@/features/preview/hooks/use-webcontainer";
import { PreviewTerminal } from "@/features/preview/components/preview-terminal";
import { getFilePath } from "@/features/preview/utils/file-tree";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

export const ShareProjectView = ({
  projectId,
}: {
  projectId: Id<"projects">;
}) => {
  const project = usePublicProject(projectId);
  const files = usePublicFiles(projectId);

  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [selectedFileId, setSelectedFileId] = useState<Id<"files"> | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

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
    enabled: project !== undefined && project !== null,
    settings: project?.settings,
    filesOverride: files,
  });

  const [terminalTab, setTerminalTab] = useState<"logs" | "shell">("logs");

  const sortedFiles = useMemo(() => {
    if (!files) return [];
    const filesMap = new Map(files.map((f) => [f._id, f]));
    return files
      .filter((f) => f.type === "file" && !f.storageId)
      .map((f) => ({
        file: f,
        path: getFilePath(f, filesMap),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const selectedFile: Doc<"files"> | undefined = useMemo(() => {
    if (selectedFileId) {
      return sortedFiles.find((item) => item.file._id === selectedFileId)?.file;
    }
    return sortedFiles[0]?.file;
  }, [sortedFiles, selectedFileId]);

  if (project === undefined || files === undefined) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground gap-2">
        <Loader2Icon className="size-4 animate-spin" />
        <span className="text-sm">Loading shared project...</span>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-center p-6 gap-3">
        <LockIcon className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Project is private or not found</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          The owner has not enabled public sharing for this project.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Go to BrowserIDE</Link>
        </Button>
      </div>
    );
  }

  const isLoading = status === "booting" || status === "installing";

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-11 flex items-center justify-between px-3 bg-sidebar border-b shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm font-medium">
            <Image src="/logo.svg" alt="BrowserIDE" width={20} height={20} />
            <span>BrowserIDE</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate max-w-60">
            {project.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-accent text-muted-foreground">
            Read-only Share
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={activeTab === "preview" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </Button>
          <Button
            size="sm"
            variant={activeTab === "code" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("code")}
          >
            Code ({sortedFiles.length})
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">
        {activeTab === "preview" ? (
          <div className="h-full flex flex-col">
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
                {isLoading
                  ? status === "booting"
                    ? "Starting WebContainer..."
                    : "Installing dependencies..."
                  : previewUrl ?? "Ready"}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-full rounded-none"
                title="Toggle terminal"
                onClick={() => setShowTerminal((v) => !v)}
              >
                <TerminalSquareIcon className="size-3" />
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <Allotment vertical>
                <Allotment.Pane>
                  {error ? (
                    <div className="size-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <p className="text-sm">{error}</p>
                      <Button size="sm" variant="outline" onClick={restart}>
                        Restart
                      </Button>
                    </div>
                  ) : isLoading ? (
                    <div className="size-full flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin" />
                      <span className="text-sm">Booting preview...</span>
                    </div>
                  ) : previewUrl ? (
                    <iframe
                      src={previewUrl}
                      className="size-full border-0"
                      title="Shared Project Preview"
                    />
                  ) : null}
                </Allotment.Pane>
                {showTerminal && (
                  <Allotment.Pane minSize={100} maxSize={400} preferredSize={180}>
                    <div className="h-full flex flex-col bg-background border-t">
                      <div className="h-7 flex items-center justify-between px-3 text-xs text-muted-foreground border-b border-border/50 shrink-0">
                        <span>Terminal</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setTerminalTab("logs")}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs cursor-pointer",
                              terminalTab === "logs" && "bg-accent text-foreground"
                            )}
                          >
                            Logs
                          </button>
                          <button
                            type="button"
                            onClick={() => setTerminalTab("shell")}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs cursor-pointer",
                              terminalTab === "shell" && "bg-accent text-foreground"
                            )}
                          >
                            Shell (jsh)
                          </button>
                        </div>
                      </div>
                      {terminalTab === "logs" ? (
                        <PreviewTerminal key="share-logs" output={terminalOutput} />
                      ) : (
                        <PreviewTerminal
                          key="share-shell"
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
        ) : (
          <Allotment defaultSizes={[260, 1000]}>
            <Allotment.Pane minSize={180} maxSize={450}>
              <div className="h-full overflow-y-auto bg-sidebar border-r p-2 flex flex-col gap-0.5">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <FolderIcon className="size-3.5" />
                  <span>Files</span>
                </div>
                {sortedFiles.map(({ file, path }) => (
                  <button
                    key={file._id}
                    type="button"
                    onClick={() => setSelectedFileId(file._id)}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left truncate cursor-pointer",
                      selectedFile?._id === file._id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <FileIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{path}</span>
                  </button>
                ))}
              </div>
            </Allotment.Pane>
            <Allotment.Pane>
              <div className="h-full overflow-auto p-4 font-mono text-xs bg-background">
                {selectedFile ? (
                  <pre className="whitespace-pre-wrap break-words">
                    {selectedFile.content ?? ""}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">No text files to display.</p>
                )}
              </div>
            </Allotment.Pane>
          </Allotment>
        )}
      </div>
    </div>
  );
};
