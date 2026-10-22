import { describe, expect, it } from "vitest";
import {
  camelCase,
  featureFiles,
  pascalCase,
  registryFile,
  routePageFile,
  validateFeatureId,
  validateRoute,
} from "./templates";

describe("validateFeatureId", () => {
  it.each(["blob", "mini-game", "a1", "sound-fx2"])("accepts %s", (id) => {
    expect(validateFeatureId(id)).toBeNull();
  });

  it.each(["Blob", "1blob", "blob-", "-blob", "blob--x", "blob_x", "registry", "x".repeat(31)])(
    "rejects %s",
    (id) => {
      expect(validateFeatureId(id)).not.toBeNull();
    },
  );
});

describe("validateRoute", () => {
  it.each(["/", "/feedback", "/a/b-c"])("accepts %s", (route) => {
    expect(validateRoute(route)).toBeNull();
  });

  it.each(["", "feedback", "/Feedback", "/a/", "/../x"])("rejects %s", (route) => {
    expect(validateRoute(route)).not.toBeNull();
  });
});

describe("naming", () => {
  it("converts kebab-case ids", () => {
    expect(pascalCase("mini-game")).toBe("MiniGame");
    expect(camelCase("mini-game")).toBe("miniGame");
  });
});

describe("featureFiles", () => {
  const files = featureFiles({ id: "mini-game", route: "/mini-game" });
  const paths = files.map((file) => file.path);

  it("creates the full required feature shape", () => {
    expect(paths).toEqual(
      expect.arrayContaining([
        "src/features/mini-game/feature.manifest.ts",
        "src/features/mini-game/index.ts",
        "src/features/mini-game/README.md",
        "src/features/mini-game/components/mini-game-panel.tsx",
        "src/features/mini-game/lib/format-heading.ts",
        "src/features/mini-game/tests/format-heading.test.ts",
        "src/features/mini-game/tests/mini-game.e2e.ts",
      ]),
    );
  });

  it("uses every manifest selector as a data-testid in the component", () => {
    const component = files.find((file) => file.path.endsWith("mini-game-panel.tsx"))?.content ?? "";
    expect(component).toContain('data-testid="mini-game-panel"');
    expect(component).toContain('data-testid="mini-game-heading"');
  });

  it("writes no code comments into src", () => {
    for (const file of files.filter((entry) => /\.tsx?$/.test(entry.path))) {
      expect(file.content).not.toMatch(/(^|\s)\/\/|\/\*/m);
    }
  });
});

describe("routePageFile", () => {
  it("maps / to the home page", () => {
    expect(routePageFile({ id: "blob", route: "/" }).path).toBe("src/app/page.tsx");
    expect(routePageFile({ id: "x", route: "/x" }).path).toBe("src/app/x/page.tsx");
  });
});

describe("registryFile", () => {
  it("lists manifests sorted by id", () => {
    const { content } = registryFile(["timeline", "blob"]);
    expect(content.indexOf("blobManifest")).toBeLessThan(content.indexOf("timelineManifest"));
  });
});
