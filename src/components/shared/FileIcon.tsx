import {
  Disc,
  File as FileGeneric,
  FileArchive,
  FileAudio,
  FileCode,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Package,
  Smartphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { extensionOf } from '@/lib/format';

type Tone = 'zinc' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan' | 'indigo';

const TONE_CLASS: Record<Tone, string> = {
  zinc: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  blue: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
};

interface Kind {
  icon: LucideIcon;
  tone: Tone;
  label: string;
}

const DEFAULT_KIND: Kind = { icon: FileGeneric, tone: 'zinc', label: 'File' };

const BY_EXTENSION: Record<string, Kind> = {
  // Archives
  zip: { icon: FileArchive, tone: 'amber', label: 'ZIP archive' },
  rar: { icon: FileArchive, tone: 'amber', label: 'RAR archive' },
  '7z': { icon: FileArchive, tone: 'amber', label: '7-Zip archive' },
  tar: { icon: FileArchive, tone: 'amber', label: 'Tape archive' },
  gz: { icon: FileArchive, tone: 'amber', label: 'Gzip archive' },
  tgz: { icon: FileArchive, tone: 'amber', label: 'Compressed tar' },
  bz2: { icon: FileArchive, tone: 'amber', label: 'Bzip2 archive' },
  xz: { icon: FileArchive, tone: 'amber', label: 'XZ archive' },

  // Disk images / packages
  iso: { icon: Disc, tone: 'violet', label: 'Disk image' },
  img: { icon: Disc, tone: 'violet', label: 'Disk image' },
  dmg: { icon: Disc, tone: 'violet', label: 'macOS disk image' },
  exe: { icon: Package, tone: 'blue', label: 'Windows executable' },
  msi: { icon: Package, tone: 'blue', label: 'Windows installer' },
  deb: { icon: Package, tone: 'blue', label: 'Debian package' },
  rpm: { icon: Package, tone: 'blue', label: 'RPM package' },
  appimage: { icon: Package, tone: 'blue', label: 'AppImage' },

  // Mobile
  apk: { icon: Smartphone, tone: 'emerald', label: 'Android package' },
  aab: { icon: Smartphone, tone: 'emerald', label: 'Android bundle' },
  ipa: { icon: Smartphone, tone: 'emerald', label: 'iOS package' },

  // Media
  png: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  jpg: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  jpeg: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  gif: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  webp: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  avif: { icon: ImageIcon, tone: 'rose', label: 'Image' },
  svg: { icon: ImageIcon, tone: 'rose', label: 'Vector image' },
  mp4: { icon: FileVideo, tone: 'rose', label: 'Video' },
  mkv: { icon: FileVideo, tone: 'rose', label: 'Video' },
  mov: { icon: FileVideo, tone: 'rose', label: 'Video' },
  avi: { icon: FileVideo, tone: 'rose', label: 'Video' },
  webm: { icon: FileVideo, tone: 'rose', label: 'Video' },
  mp3: { icon: FileAudio, tone: 'cyan', label: 'Audio' },
  wav: { icon: FileAudio, tone: 'cyan', label: 'Audio' },
  flac: { icon: FileAudio, tone: 'cyan', label: 'Audio' },
  ogg: { icon: FileAudio, tone: 'cyan', label: 'Audio' },
  m4a: { icon: FileAudio, tone: 'cyan', label: 'Audio' },

  // Textual
  pdf: { icon: FileText, tone: 'rose', label: 'PDF document' },
  txt: { icon: FileText, tone: 'zinc', label: 'Text file' },
  md: { icon: FileText, tone: 'zinc', label: 'Markdown' },
  log: { icon: FileText, tone: 'zinc', label: 'Log file' },
  csv: { icon: FileText, tone: 'zinc', label: 'CSV' },
  json: { icon: FileText, tone: 'indigo', label: 'JSON' },
  xml: { icon: FileText, tone: 'indigo', label: 'XML' },
  yml: { icon: FileText, tone: 'indigo', label: 'YAML' },
  yaml: { icon: FileText, tone: 'indigo', label: 'YAML' },
  toml: { icon: FileText, tone: 'indigo', label: 'TOML' },
  ini: { icon: FileText, tone: 'indigo', label: 'INI' },
  sums: { icon: FileText, tone: 'emerald', label: 'Checksum manifest' },
  sha256: { icon: FileText, tone: 'emerald', label: 'Checksum manifest' },
  sha512: { icon: FileText, tone: 'emerald', label: 'Checksum manifest' },
  md5: { icon: FileText, tone: 'emerald', label: 'Checksum manifest' },
  asc: { icon: FileText, tone: 'emerald', label: 'Signature' },
  sig: { icon: FileText, tone: 'emerald', label: 'Signature' },

  // Source
  js: { icon: FileCode, tone: 'indigo', label: 'JavaScript' },
  mjs: { icon: FileCode, tone: 'indigo', label: 'JavaScript' },
  cjs: { icon: FileCode, tone: 'indigo', label: 'JavaScript' },
  ts: { icon: FileCode, tone: 'indigo', label: 'TypeScript' },
  tsx: { icon: FileCode, tone: 'indigo', label: 'React component' },
  jsx: { icon: FileCode, tone: 'indigo', label: 'React component' },
  py: { icon: FileCode, tone: 'indigo', label: 'Python' },
  rs: { icon: FileCode, tone: 'indigo', label: 'Rust' },
  go: { icon: FileCode, tone: 'indigo', label: 'Go' },
  c: { icon: FileCode, tone: 'indigo', label: 'C source' },
  h: { icon: FileCode, tone: 'indigo', label: 'C header' },
  cpp: { icon: FileCode, tone: 'indigo', label: 'C++ source' },
  java: { icon: FileCode, tone: 'indigo', label: 'Java' },
  sh: { icon: FileCode, tone: 'indigo', label: 'Shell script' },
};

export function fileKind(filename: string): Kind {
  return BY_EXTENSION[extensionOf(filename)] ?? DEFAULT_KIND;
}

export interface FileIconProps {
  filename: string;
  className?: string;
  /** Size of the icon itself, in px. */
  size?: number;
}

/** Small rounded badge with an extension-specific glyph. */
export function FileIcon({ filename, className, size = 16 }: FileIconProps) {
  const { icon: Icon, tone } = fileKind(filename);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border',
        TONE_CLASS[tone],
        className,
      )}
      style={{ width: size + 14, height: size + 14 }}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
