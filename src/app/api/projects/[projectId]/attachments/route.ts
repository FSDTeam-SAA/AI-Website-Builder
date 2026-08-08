import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";

/**
 * Upload an image to attach to a chat message.
 *
 * Bytes go straight into Postgres rather than the StorageDriver: attachments
 * are small (the client downscales before upload, and this caps hard), and a
 * row cascade-deletes with its project. A storage-driver object would outlive
 * the project and leak.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Formats every supported vision provider accepts. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PENDING = 8;

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json(
      { error: "Only PNG, JPEG, WebP and GIF images are supported." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: "That image is larger than 5MB. Try a smaller screenshot." },
      { status: 413 },
    );
  }

  // Bound how much a single composer session can accumulate before sending.
  const pending = await prisma.attachment.count({
    where: { projectId, messageId: null },
  });
  if (pending >= MAX_PENDING) {
    return Response.json(
      { error: "Too many pending attachments. Send or remove some first." },
      { status: 429 },
    );
  }

  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;
  const data = Buffer.from(await file.arrayBuffer());

  const attachment = await prisma.attachment.create({
    data: {
      projectId,
      name: (file.name || "image").slice(0, 200),
      mime: file.type,
      size: data.byteLength,
      width,
      height,
      data,
    },
    select: { id: true, name: true, mime: true, size: true, width: true, height: true },
  });

  return Response.json(attachment, { status: 201 });
}
