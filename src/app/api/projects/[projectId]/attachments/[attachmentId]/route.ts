import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";

/** Serve and delete a chat attachment. Owner-scoped — attachments are private. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireOwnedAttachment(projectId: string, attachmentId: string) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized", status: 401 as const };

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, projectId, project: { userId } },
  });
  if (!attachment) return { error: "Not found", status: 404 as const };

  return { attachment };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  const { projectId, attachmentId } = await context.params;
  const result = await requireOwnedAttachment(projectId, attachmentId);
  if ("error" in result) {
    return new Response(result.error, { status: result.status });
  }

  const { attachment } = result;
  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "content-type": attachment.mime,
      "content-length": String(attachment.size),
      // Immutable content at an unguessable id, but private to the owner.
      "cache-control": "private, max-age=31536000, immutable",
      "content-disposition": `inline; filename="${encodeURIComponent(attachment.name)}"`,
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  const { projectId, attachmentId } = await context.params;
  const result = await requireOwnedAttachment(projectId, attachmentId);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Only unsent attachments can be removed; once a message references one it is
  // part of the conversation record.
  if (result.attachment.messageId) {
    return Response.json(
      { error: "This image has already been sent." },
      { status: 409 },
    );
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  return Response.json({ ok: true });
}
