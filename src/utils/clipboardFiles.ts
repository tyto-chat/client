export function filesFromClipboard(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  return collect(data.files, data.items).map(withTimestampName);
}

export function filesFromDrop(event: DragEvent): File[] {
  const data = event.dataTransfer;
  if (!data) return [];
  return collect(data.files, data.items);
}

export function withTimestampName(file: File): File {
  const subtype = file.type.split("/")[1] ?? "";
  const ext = subtype.replace(/[+;].*/, "") || "bin";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([file], `pasted-${ts}.${ext}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

function collect(files: FileList, items: DataTransferItemList): File[] {
  const fromFiles = Array.from(files);
  if (fromFiles.length > 0) return fromFiles;
  const out: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}
