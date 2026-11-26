import { describe, expect, it } from "vitest";

import { buildFileTree, getFilePath } from "./file-tree";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

const makeFile = (
  overrides: Partial<FileDoc> & { _id: Id<"files">; name: string; type: "file" | "folder" }
): FileDoc => ({
  _creationTime: 1000,
  projectId: "proj_1" as Id<"projects">,
  updatedAt: 1000,
  ...overrides,
});

describe("file-tree utilities", () => {
  it("builds a nested WebContainer FileSystemTree and skips binary files", () => {
    const srcId = "folder_src" as Id<"files">;
    const files: FileDoc[] = [
      makeFile({ _id: srcId, name: "src", type: "folder" }),
      makeFile({
        _id: "file_index" as Id<"files">,
        name: "index.ts",
        type: "file",
        parentId: srcId,
        content: "console.log('hello');",
      }),
      makeFile({
        _id: "file_pkg" as Id<"files">,
        name: "package.json",
        type: "file",
        content: '{"name":"app"}',
      }),
      makeFile({
        _id: "file_bin" as Id<"files">,
        name: "logo.png",
        type: "file",
        storageId: "storage_1" as Id<"_storage">,
      }),
    ];

    const tree = buildFileTree(files);

    expect(tree).toEqual({
      src: {
        directory: {
          "index.ts": {
            file: { contents: "console.log('hello');" },
          },
        },
      },
      "package.json": {
        file: { contents: '{"name":"app"}' },
      },
    });
  });

  it("resolves full file paths by walking parentId chain", () => {
    const rootFolder = makeFile({
      _id: "f1" as Id<"files">,
      name: "src",
      type: "folder",
    });
    const nestedFolder = makeFile({
      _id: "f2" as Id<"files">,
      name: "components",
      type: "folder",
      parentId: rootFolder._id,
    });
    const leafFile = makeFile({
      _id: "f3" as Id<"files">,
      name: "Button.tsx",
      type: "file",
      parentId: nestedFolder._id,
      content: "export const Button = () => null;",
    });

    const map = new Map([
      [rootFolder._id, rootFolder],
      [nestedFolder._id, nestedFolder],
      [leafFile._id, leafFile],
    ]);

    expect(getFilePath(leafFile, map)).toBe("src/components/Button.tsx");
  });
});
