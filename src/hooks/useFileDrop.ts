import { useCallback, useRef, useState } from 'react';

import { filesFromDataTransfer, type PickedFile } from '@/lib/pick-files';

export interface UseFileDropOptions {
  onFiles: (files: PickedFile[]) => void | Promise<void>;
  /** Reject drops that do not satisfy this predicate (calls `onReject`). */
  accept?: (file: PickedFile) => boolean;
  onReject?: (reason: string) => void;
  disabled?: boolean;
}

export interface UseFileDropResult {
  isDragging: boolean;
  isReading: boolean;
  /** Spread onto the drop target element. */
  dropProps: {
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };
}

/**
 * Drag & drop plumbing shared by every dropzone.
 *
 * Uses a depth counter instead of a boolean so that dragging *over child elements*
 * (which fires `dragleave` on the parent) does not make the highlight flicker.
 */
export function useFileDrop({
  onFiles,
  accept,
  onReject,
  disabled = false,
}: UseFileDropOptions): UseFileDropResult {
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const depth = useRef(0);

  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !hasFiles(event)) return;
      // Required, otherwise the browser navigates to the dropped file.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setIsDragging(false);
      if (disabled) return;

      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;

      setIsReading(true);
      try {
        const picked = await filesFromDataTransfer(dataTransfer);
        const accepted = accept ? picked.filter(accept) : picked;
        if (picked.length > 0 && accepted.length === 0) {
          onReject?.('No supported files in that drop.');
          return;
        }
        if (accepted.length > 0) await onFiles(accepted);
      } catch (error) {
        onReject?.(error instanceof Error ? error.message : 'Could not read the dropped items.');
      } finally {
        setIsReading(false);
      }
    },
    [accept, disabled, onFiles, onReject],
  );

  return {
    isDragging,
    isReading,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
