import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer, type WebContainerProcess } from "@webcontainer/api";

import { 
  buildFileTree,
  getFilePath
} from "@/features/preview/utils/file-tree";
import { useFiles } from "@/features/projects/hooks/use-files";

import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";

// Singleton WebContainer instance
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

const getWebContainer = async (): Promise<WebContainer> => {
  if (webcontainerInstance) {
    return webcontainerInstance;
  }

  if (!bootPromise) {
    bootPromise = WebContainer.boot({ coep: "credentialless" });
  }

  webcontainerInstance = await bootPromise;
  return webcontainerInstance;
};

const teardownWebContainer = () => {
  if (webcontainerInstance) {
    webcontainerInstance.teardown();
    webcontainerInstance = null;
  }
  bootPromise = null;
};

interface UseWebContainerProps {
  projectId: Id<"projects">;
  enabled: boolean;
  settings?: {
    installCommand?: string;
    devCommand?: string;
  };
  filesOverride?: Doc<"files">[];
};

export const useWebContainer = ({
  projectId,
  enabled,
  settings,
  filesOverride,
}: UseWebContainerProps) => {
  const [status, setStatus] = useState<
    "idle" | "booting" | "installing" | "running" | "error"
  >("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [shellOutput, setShellOutput] = useState("");

  const containerRef = useRef<WebContainer | null>(null);
  const shellProcessRef = useRef<WebContainerProcess | null>(null);
  const shellInputWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const hasStartedRef = useRef(false);

  // Fetch files from Convex (auto-updates on changes) unless overridden (e.g. public share view)
  const fetchedFiles = useFiles(filesOverride ? null : projectId);
  const files = filesOverride ?? fetchedFiles;

  // Initial boot and mount
  useEffect(() => {
    if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    const start = async () => {
      try {
        setStatus("booting");
        setError(null);
        setTerminalOutput("");
        setShellOutput("");

        const appendOutput = (data: string) => {
          setTerminalOutput((prev) => prev + data);
        };

        const container = await getWebContainer();
        containerRef.current = container;

        const fileTree = buildFileTree(files);
        await container.mount(fileTree);

        // Spawn an interactive jsh shell in the background for the Shell tab
        container.spawn("jsh").then((shellProcess) => {
          shellProcessRef.current = shellProcess;
          shellInputWriterRef.current = shellProcess.input.getWriter();
          shellProcess.output
            .pipeTo(
              new WritableStream({
                write(data) {
                  setShellOutput((prev) => prev + data);
                },
              })
            )
            .catch(() => {
              // Ignore stream close errors during teardown/restart
            });
        }).catch(() => {
          // Non-fatal if jsh is unavailable
        });

        container.on("server-ready", (_port, url) => {
          setPreviewUrl(url);
          setStatus("running");
        });

        setStatus("installing");

        // Parse install command (default: npm install)
        const installCmd = settings?.installCommand || "npm install";
        const [installBin, ...installArgs] = installCmd.split(" ");
        appendOutput(`$ ${installCmd}\n`)
        const installProcess = await container.spawn(installBin, installArgs);
        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        );
        const installExitCode = await installProcess.exit;

        if (installExitCode !== 0) {
          throw new Error(
            `${installCmd} failed with code ${installExitCode}`
          );
        }

        // Parse dev command (default: npm run dev)
        const devCmd = settings?.devCommand || "npm run dev";
        const [devBin, ...devArgs] = devCmd.split(" ");
        appendOutput(`\n$ ${devCmd}\n`);
        const devProcess = await container.spawn(devBin, devArgs);
        devProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              appendOutput(data);
            },
          })
        );
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error");
        setStatus("error");
      }
    };

    start();
  }, [
    enabled,
    files,
    restartKey,
    settings?.devCommand,
    settings?.installCommand,
  ]);

  // Sync file changes (hot-reload)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !files || status !== "running") return;

    const filesMap = new Map(files.map((f) => [f._id, f]));

    for (const file of files) {
      if (file.type !== "file" || file.storageId || !file.content) continue;

      const filePath = getFilePath(file, filesMap);
      container.fs.writeFile(filePath, file.content);
    }
  }, [files, status]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) {
      hasStartedRef.current = false;
      shellInputWriterRef.current = null;
      shellProcessRef.current?.kill();
      shellProcessRef.current = null;
      setStatus("idle");
      setPreviewUrl(null);
      setError(null);
    }
  }, [enabled]);

  // Send input to the interactive jsh shell
  const sendShellInput = useCallback((data: string) => {
    shellInputWriterRef.current?.write(data).catch(() => {
      // Ignore write errors if shell exited
    });
  }, []);

  // Restart the entire WebContainer process
  const restart = useCallback(() => {
    shellInputWriterRef.current = null;
    shellProcessRef.current?.kill();
    shellProcessRef.current = null;
    teardownWebContainer();
    containerRef.current = null;
    hasStartedRef.current = false;
    setStatus("idle");
    setPreviewUrl(null);
    setError(null);
    setShellOutput("");
    setRestartKey((k) => k + 1);
  }, []);

  return {
    status,
    previewUrl,
    error,
    restart,
    terminalOutput,
    shellOutput,
    sendShellInput,
  };
};
