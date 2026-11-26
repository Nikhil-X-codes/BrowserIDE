import { describe, expect, it } from "vitest";

import { stripCodeFences } from "@/lib/groq";

describe("stripCodeFences", () => {
  it("removes surrounding markdown code fences", () => {
    const input = "```typescript\nconst x = 1;\n```";
    expect(stripCodeFences(input)).toBe("const x = 1;");
  });

  it("returns plain code untouched when no fences are present", () => {
    const input = "  const y = 2;  ";
    expect(stripCodeFences(input)).toBe("const y = 2;");
  });
});
