import Image from "next/image";

import { ProjectForm } from "@/modules/home/ui/components/project-form";
import { ProjectsList } from "@/modules/home/ui/components/projects-list";

const Page = () => {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-8 sm:px-6 lg:px-8">
      <section className="flex min-h-[680px] flex-col items-center justify-center pb-16 pt-28">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-5 w-fit">
            <div className="absolute inset-0 scale-150 rounded-full bg-indigo-400/20 blur-2xl dark:bg-indigo-500/15" />
            <span className="relative flex size-16 items-center justify-center rounded-2xl border border-white/80 bg-white/90 p-2 shadow-[0_18px_45px_-20px_rgba(79,70,229,0.55)] ring-1 ring-zinc-900/5 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:ring-white/10">
              <Image
                src="/brand/vibe-mark.png"
                alt="Vibe"
                width={50}
                height={50}
                priority
              />
            </span>
          </div>
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
            Start a new project
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-zinc-950 sm:text-4xl dark:text-white">
            Build something with Vibe
          </h1>
          <p className="mt-3 text-sm text-zinc-500 sm:text-base dark:text-zinc-400">
            Describe your idea and we&apos;ll create the first version for you.
          </p>
        </div>

        <div id="build" className="w-full max-w-3xl scroll-mt-28">
          <ProjectForm />
        </div>
      </section>

      <ProjectsList />
    </div>
  );
};

export default Page;
