import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { serverEnv } from "@/lib/env";

import { cacheControlFor, type StorageDriver } from "./index";

/**
 * S3-compatible driver — works with AWS S3, Cloudflare R2, MinIO and Backblaze.
 *
 * `S3_ENDPOINT` plus `forcePathStyle` is what makes the non-AWS providers work.
 */
export function createS3Driver(): StorageDriver {
  const env = serverEnv();
  const client = new S3Client({
    region: env.S3_REGION || "auto",
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  const Bucket = env.S3_BUCKET;

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControlFor(key),
        }),
      );
    },

    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        return {
          body: Buffer.from(bytes),
          contentType: res.ContentType ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },

    async deletePrefix(prefix) {
      let token: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (listed.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => !!k);

        if (keys.length) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket,
              Delete: { Objects: keys.map((Key) => ({ Key })) },
            }),
          );
        }
        token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (token);
    },

    publicUrl(key) {
      const base = serverEnv().S3_PUBLIC_BASE_URL;
      if (!base) return null;
      return `${base.replace(/\/+$/, "")}/${key}`;
    },
  };
}
