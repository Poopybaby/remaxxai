"use client";

import { unzipSync } from "fflate";
import { UPLOAD_LIMITS } from "@/config/limits";
import type { RawEntry } from "./types";

/** Reads a dropped .zip in the browser, refusing archives that would expand dangerously. */
export async function readZip(file: File): Promise<RawEntry[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  let entries = 0;
  let expanded = 0;
  let tooBig = false;
  const out = unzipSync(data, {
    filter: (f) => {
      if (f.name.endsWith("/")) return false; // directory entries
      entries++;
      expanded += f.originalSize;
      if (entries > UPLOAD_LIMITS.maxZipEntries || expanded > UPLOAD_LIMITS.maxUnzippedBytes) {
        tooBig = true;
        return false;
      }
      return true;
    },
  });
  if (tooBig) throw new Error("This zip expands to too many files or too much data.");
  return Object.entries(out).map(([path, bytes]) => ({ path, bytes }));
}

/** Reads files from a folder picker (webkitRelativePath) or a plain multi-file pick. */
export async function readFileList(files: FileList | File[]): Promise<RawEntry[]> {
  const list = Array.from(files);
  if (list.length > UPLOAD_LIMITS.maxZipEntries) throw new Error("That folder has too many files.");
  return Promise.all(
    list.map(async (f) => ({
      path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

/**
 * Shrinks a cover image in the browser (max 1600px wide, WebP) so uploads stay small and fast.
 * Falls back to the original file if the browser can't encode WebP.
 */
export async function compressCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  return blob && blob.type === "image/webp" && blob.size < file.size ? blob : file;
}

/**
 * Turns a picked image into a square profile picture: center crop, 512×512, WebP (JPEG if the
 * browser can't encode WebP). Also strips any embedded metadata, such as photo location.
 */
export async function squareAvatar(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")
    ?.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
  bitmap.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("This browser couldn't read that image.");
  return jpeg;
}
