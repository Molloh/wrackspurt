import { describe, expect, it } from "vitest";

import {
  artifactKindToCliFormat,
  mapSourceType,
  mapTaskStatus,
} from "../src/notebooklm-parser.js";

describe("mapSourceType", () => {
  it("normalises known types", () => {
    expect(mapSourceType("URL")).toBe("url");
    expect(mapSourceType("text")).toBe("text");
    expect(mapSourceType("YouTube")).toBe("youtube");
  });

  it("falls back to file for unknown types", () => {
    expect(mapSourceType("pdf")).toBe("file");
    expect(mapSourceType("")).toBe("file");
  });
});

describe("mapTaskStatus", () => {
  it.each([
    ["queued", "queued"],
    ["pending", "queued"],
    ["running", "running"],
    ["in_progress", "running"],
    ["completed", "completed"],
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["error", "failed"],
    ["???", "queued"],
  ])("%s -> %s", (input, expected) => {
    expect(mapTaskStatus(input)).toBe(expected);
  });
});

describe("artifactKindToCliFormat", () => {
  it("maps report-like kinds to briefing-doc", () => {
    expect(artifactKindToCliFormat("report")).toBe("briefing-doc");
    expect(artifactKindToCliFormat("briefing")).toBe("briefing-doc");
  });

  it("passes through other kinds", () => {
    expect(artifactKindToCliFormat("quiz")).toBe("quiz");
    expect(artifactKindToCliFormat("mind-map")).toBe("mind-map");
  });
});
