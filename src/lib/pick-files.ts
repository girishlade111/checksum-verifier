/**
 * Turning a drop / file-picker result into a flat list of files.
 *
 * Drag-and-drop is the only way a browser can hand us a whole folder, and the payload
 * arrives as a tree of `FileSystemEntry` objects rather than `File`s, so we walk it
 * recursively. `File` objects stay lazy (they are just handles to bytes on disk) — we
 * only ever read them chunk-by-chunk inside the hashing worker.
 */

export interface PickedFile {
  id: string;
  file: File;
  /** Basename, e.g. `app.apk`. */
  name: string;
  /** Path relative to the dropped root, e.g. `dist/app.apk`. Used for manifest matching. */
  relativePath: string;
  size: number;
}

let counter = 0;

function makePickedFile(file: File, relativePath: string): PickedFile {
  counter += 1;
  return {
    id: `pf_${counter}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    name: file.name,
    relativePath: relativePath.replace(/^\/+/, ''),
    size: file.size,
  };
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: PickedFile[]) {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    out.push(makePickedFile(file, `${prefix}${file.name}`));
    return;
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // `readEntries` yields at most 100 entries per call; keep reading until it returns [].
    for (;;) {
      const batch = await readEntries(reader);
      if (batch.length === 0) break;
      for (const child of batch) {
        await walkEntry(child, `${prefix}${entry.name}/`, out);
      }
    }
  }
}

/**
 * Extracts every file (including nested ones) from a drop event.
 * Falls back to `dataTransfer.files` when the entries API is unavailable.
 */
export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    const out: PickedFile[] = [];
    for (const entry of entries) {
      await walkEntry(entry, '', out);
    }
    if (out.length > 0) return out;
  }

  return Array.from(dataTransfer.files).map((file) =>
    makePickedFile(file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name),
  );
}

/** Plain `FileList` (from `<input type="file">`) -> `PickedFile[]`. */
export function filesFromFileList(fileList: FileList | null | undefined): PickedFile[] {
  if (!fileList) return [];
  return Array.from(fileList).map((file) =>
    makePickedFile(
      file,
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    ),
  );
}

/** Props that turn an `<input type="file">` into a folder picker. */
export const DIRECTORY_INPUT_ATTRS = {
  webkitdirectory: '',
  directory: '',
  mozdirectory: '',
} as unknown as Record<string, string>;
