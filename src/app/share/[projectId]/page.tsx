import { ShareProjectView } from "@/features/projects/components/share-project-view";

import { Id } from "../../../../convex/_generated/dataModel";

const ShareProjectPage = async ({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) => {
  const { projectId } = await params;

  return <ShareProjectView projectId={projectId as Id<"projects">} />;
};

export default ShareProjectPage;
