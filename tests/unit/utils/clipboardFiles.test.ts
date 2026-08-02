import { describe, it, expect } from "vitest";
import {
  filesFromClipboard,
  filesFromDrop,
  withTimestampName,
  toFileList,
} from "@/utils/clipboardFiles";

function fakeFile(name: string, type: string, body = "x"): File {
  return new File([body], name, { type });
}

type FileItem = { kind: "file"; getAsFile: () => File };
type StringItem = { kind: "string"; getAsFile: () => null };

function asFileList(files: File[]): FileList {
  const obj: Record<string | number | symbol, unknown> = { length: files.length };
  files.forEach((f, i) => (obj[i] = f));
  obj[Symbol.iterator] = function* () {
    yield* files;
  };
  return obj as unknown as FileList;
}

function asItemList(items: Array<FileItem | StringItem>): DataTransferItemList {
  const obj: Record<string | number | symbol, unknown> = { length: items.length };
  items.forEach((it, i) => (obj[i] = it));
  obj[Symbol.iterator] = function* () {
    yield* items;
  };
  return obj as unknown as DataTransferItemList;
}

function makeClipboardEvent(files: File[], stringItems: string[] = []): ClipboardEvent {
  const items: Array<FileItem | StringItem> = [
    ...files.map((f) => ({ kind: "file" as const, getAsFile: () => f })),
    ...stringItems.map(() => ({ kind: "string" as const, getAsFile: () => null })),
  ];
  return {
    clipboardData: { files: asFileList(files), items: asItemList(items) },
  } as unknown as ClipboardEvent;
}

function makeDropEvent(files: File[]): DragEvent {
  const items: FileItem[] = files.map((f) => ({ kind: "file", getAsFile: () => f }));
  return {
    dataTransfer: { files: asFileList(files), items: asItemList(items) },
  } as unknown as DragEvent;
}

describe("filesFromClipboard", () => {
  it("collects files from clipboardData.files", () => {
    const f = fakeFile("a.png", "image/png");
    const ev = makeClipboardEvent([f]);
    const result = filesFromClipboard(ev);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("image/png");
  });

  it("collects files from clipboardData.items when .files is empty", () => {
    const f = fakeFile("img.png", "image/png");
    const ev = {
      clipboardData: {
        files: asFileList([]),
        items: asItemList([{ kind: "file", getAsFile: () => f }]),
      },
    } as unknown as ClipboardEvent;
    expect(filesFromClipboard(ev)).toHaveLength(1);
  });

  it("prefers .files when both .files and .items are populated", () => {
    // Browsers populate both with distinct File instances for the same paste;
    // we must pick exactly one source, not merge them.
    const fromFiles = fakeFile("a.png", "image/png");
    const fromItems = fakeFile("a.png", "image/png");
    const ev = {
      clipboardData: {
        files: asFileList([fromFiles]),
        items: asItemList([{ kind: "file", getAsFile: () => fromItems }]),
      },
    } as unknown as ClipboardEvent;
    expect(filesFromClipboard(ev)).toHaveLength(1);
  });

  it("ignores kind=string items (text-only paste)", () => {
    const ev = makeClipboardEvent([], ["plain text"]);
    expect(filesFromClipboard(ev)).toHaveLength(0);
  });

  it("returns [] when clipboardData is missing", () => {
    expect(filesFromClipboard({ clipboardData: null } as unknown as ClipboardEvent)).toEqual([]);
  });

  it("renames pasted files to pasted-<iso>.<ext>", () => {
    const f = fakeFile("image.png", "image/png");
    const result = filesFromClipboard(makeClipboardEvent([f]));
    expect(result[0]?.name).toMatch(/^pasted-.+\.png$/);
  });
});

describe("filesFromDrop", () => {
  it("collects files from dataTransfer.files", () => {
    const f = fakeFile("photo.jpg", "image/jpeg");
    const result = filesFromDrop(makeDropEvent([f]));
    expect(result).toHaveLength(1);
  });

  it("does NOT rename dropped files (preserves disk name)", () => {
    const f = fakeFile("photo.jpg", "image/jpeg");
    const result = filesFromDrop(makeDropEvent([f]));
    expect(result[0]?.name).toBe("photo.jpg");
  });

  it("returns [] when dataTransfer is missing", () => {
    expect(filesFromDrop({ dataTransfer: null } as unknown as DragEvent)).toEqual([]);
  });
});

describe("withTimestampName", () => {
  it("derives extension from MIME subtype", () => {
    expect(withTimestampName(fakeFile("x.png", "image/png")).name).toMatch(/\.png$/);
    expect(withTimestampName(fakeFile("x.jpg", "image/jpeg")).name).toMatch(/\.jpeg$/);
  });

  it("strips parameters from subtype (e.g. image/svg+xml → svg)", () => {
    expect(withTimestampName(fakeFile("x", "image/svg+xml")).name).toMatch(/\.svg$/);
  });

  it("falls back to .bin when MIME is empty", () => {
    expect(withTimestampName(fakeFile("x", "")).name).toMatch(/\.bin$/);
  });

  it("preserves MIME type and lastModified", () => {
    const original = fakeFile("a.png", "image/png");
    const renamed = withTimestampName(original);
    expect(renamed.type).toBe("image/png");
    expect(renamed.lastModified).toBe(original.lastModified);
  });
});

describe("toFileList", () => {
  it("wraps File[] into a real FileList", () => {
    const a = fakeFile("a.png", "image/png");
    const b = fakeFile("b.png", "image/png");
    const list = toFileList([a, b]);
    expect(list.length).toBe(2);
    expect(list[0]?.name).toBe("a.png");
    expect(list[1]?.name).toBe("b.png");
  });
});
