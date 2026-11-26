"use client";

import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useState } from "react";
import { CloudCheckIcon, GlobeIcon, LoaderIcon, LockIcon } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Poppins } from "next/font/google";
import { formatDistanceToNow } from "date-fns";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Id } from "../../../../convex/_generated/dataModel";
import {
  useProject,
  useRenameProject,
  useToggleProjectPublic,
} from "../hooks/use-projects";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export const Navbar = ({
  projectId
}: {
  projectId: Id<"projects">;
}) => {
  const project = useProject(projectId);
  const renameProject = useRenameProject();
  const togglePublic = useToggleProjectPublic();

  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState("");

  const handleToggleShare = async () => {
    if (!project) return;
    const nextPublic = !project.isPublic;
    try {
      await togglePublic({ id: projectId, isPublic: nextPublic });
      if (nextPublic) {
        const shareUrl = `${window.location.origin}/share/${projectId}`;
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Public link copied to clipboard");
      } else {
        toast.success("Project is now private");
      }
    } catch {
      toast.error("Unable to update sharing settings");
    }
  };

  const handleStartRename = () => {
    if (!project) return;
    setName(project.name);
    setIsRenaming(true);
  };

  const handleSubmit = () => {
    if (!project) return;
    setIsRenaming(false);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName === project.name) return;

    renameProject({ id: projectId, name: trimmedName });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
    }
  };

  return (
    <nav className="flex justify-between items-center gap-x-2 p-2 bg-sidebar border-b">
      <div className="flex items-center gap-x-2">
        <Breadcrumb>
          <BreadcrumbList className="gap-0!">
            <BreadcrumbItem>
              <BreadcrumbLink
                className="flex items-center gap-1.5"
                asChild
              >
                <Button
                  variant="ghost"
                  className="w-fit! p-1.5! h-7!"
                  asChild
                >
                  <Link href="/">
                    <Image
                      src="/logo.svg"
                      alt="Logo"
                      width={20}
                      height={20}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        font.className,
                      )}
                    >
                      BrowserIDE
                    </span>
                  </Link>
                </Button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="ml-0! mr-1" />
            <BreadcrumbItem>
              {isRenaming ? (
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={handleSubmit}
                  onKeyDown={handleKeyDown}
                  className="text-sm bg-transparent text-foreground outline-none focus:ring-1 focus:ring-inset focus:ring-ring font-medium max-w-40 truncate"
                />
              ) : (
                <BreadcrumbPage
                  onClick={handleStartRename}
                  className="text-sm cursor-pointer hover:text-primary font-medium max-w-40 truncate"
                >
                  {project?.name ?? "Loading..."}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {project?.importStatus === "importing" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <LoaderIcon className="size-4 text-muted-foreground animate-spin" />
            </TooltipTrigger>
            <TooltipContent>Importing...</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <CloudCheckIcon className="size-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              Saved{" "}
              {project?.updatedAt 
                ? formatDistanceToNow(
                  project.updatedAt,
                  { addSuffix: true, }
                )
                : "Loading..."}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={project?.isPublic ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs gap-1.5"
              onClick={handleToggleShare}
              disabled={!project}
            >
              {project?.isPublic ? (
                <GlobeIcon className="size-3.5 text-emerald-500" />
              ) : (
                <LockIcon className="size-3.5" />
              )}
              <span>{project?.isPublic ? "Shared" : "Share"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {project?.isPublic
              ? "Click to make private (public link active)"
              : "Click to enable public read-only link & copy URL"}
          </TooltipContent>
        </Tooltip>
        <UserButton />
      </div>
    </nav>
  )
};