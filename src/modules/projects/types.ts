import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/trpc/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type ProjectMessage = RouterOutputs["messages"]["getMany"][number];

/**
 * The fragment shape carried on the chat poll.
 *
 * Deliberately narrower than the Prisma `Fragment` model — it has no `files`,
 * because shipping the file map on a 2-second poll re-sent every generated
 * source file on every tick. Read the tree via `projects.getFiles` instead.
 */
export type FragmentSummary = NonNullable<ProjectMessage["fragment"]>;
