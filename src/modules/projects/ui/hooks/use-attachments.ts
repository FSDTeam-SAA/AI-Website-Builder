"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface PendingAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Object URL for the local preview thumbnail. */
  previewUrl: string;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Vision models gain nothing above roughly this edge length. */
const MAX_EDGE = 1568;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Downscale before upload.
 *
 * A raw 4K screenshot is several megabytes and costs vision tokens
 * proportional to its pixel count, while adding no detail the model can use.
 * Resizing in the browser cuts both, and keeps rows small enough to live
 * comfortably in Postgres.
 */
async function downscale(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  // Animated GIFs would lose their animation through a canvas, and are small
  // enough to pass through untouched.
  if (file.type === "image/gif") {
    return { blob: file, width: 0, height: 0 };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, width: 0, height: 0 };

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) {
    bitmap.close();
    return { blob: file, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, width, height };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    // PNG keeps screenshot text crisp; JPEG would smear it.
    canvas.toBlob(resolve, "image/png"),
  );
  return { blob: blob ?? file, width, height };
}

export function useAttachments(projectId: string) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => ACCEPTED.includes(f.type));
      if (images.length === 0) {
        if (files.length) toast.error("Only PNG, JPEG, WebP and GIF images are supported.");
        return;
      }

      setIsUploading(true);
      try {
        for (const file of images) {
          const { blob, width, height } = await downscale(file);

          if (blob.size > MAX_UPLOAD_BYTES) {
            toast.error(`${file.name} is too large even after resizing.`);
            continue;
          }

          const body = new FormData();
          body.append("file", new File([blob], file.name || "image.png", { type: blob.type }));
          if (width) body.append("width", String(width));
          if (height) body.append("height", String(height));

          const res = await fetch(`/api/projects/${projectId}/attachments`, {
            method: "POST",
            body,
          });

          if (!res.ok) {
            const { error } = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error(error ?? "Could not upload that image.");
            continue;
          }

          const created = (await res.json()) as Omit<PendingAttachment, "previewUrl">;
          const previewUrl = URL.createObjectURL(blob);
          objectUrls.current.push(previewUrl);
          setAttachments((prev) => [...prev, { ...created, previewUrl }]);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [projectId],
  );

  const remove = useCallback(
    async (id: string) => {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      await fetch(`/api/projects/${projectId}/attachments/${id}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    [projectId],
  );

  /** Called after a successful send — the rows now belong to the message. */
  const clear = useCallback(() => setAttachments([]), []);

  const onPaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      void upload(files);
    },
    [upload],
  );

  return { attachments, isUploading, upload, remove, clear, onPaste };
}
