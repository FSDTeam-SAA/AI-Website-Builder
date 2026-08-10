"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowUpIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";

import { ModelSelect } from "./model-select";
import { FrameworkSelect } from "./framework-select";

import { PROJECT_TEMPLATES } from "../../constants";

const formSchema = z.object({
  value: z.string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
})

export const ProjectForm = () => {
  const router = useRouter();
  const trpc = useTRPC();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      value: "",
    },
  });
  
  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(
        trpc.projects.getMany.queryOptions(),
      );
      queryClient.invalidateQueries(
        trpc.usage.status.queryOptions(),
      );
      router.push(`/projects/${data.id}`);
    },
    onError: (error) => {
      toast.error(error.message);
      
      if (error.data?.code === "UNAUTHORIZED") {
        clerk.openSignIn();
      }

    },
  }));
  
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createProject.mutate({
      value: values.value,
      modelId,
      framework,
    });
  };

  const onSelect = (value: string) => {
    form.setValue("value", value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    });
  };

  const [modelId, setModelId] = useState<string | null>(null);
  const [framework, setFramework] = useState<"NEXTJS" | "STATIC_HTML">("STATIC_HTML");
  const [isFocused, setIsFocused] = useState(false);
  const isPending = createProject.isPending;
  const isButtonDisabled = isPending || !form.formState.isValid;

  return (
    <Form {...form}>
      <div>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            "relative rounded-[1.75rem] border border-zinc-200/90 bg-white/90 p-4 text-left shadow-[0_24px_70px_-32px_rgba(79,70,229,0.4)] ring-1 ring-zinc-900/[0.03] backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-zinc-950/85 dark:ring-white/10",
            isFocused &&
              "border-indigo-400 shadow-[0_28px_80px_-30px_rgba(79,70,229,0.55)] ring-4 ring-indigo-500/10 dark:border-indigo-400/60",
          )}
        >
          <div className="mb-1 flex items-center gap-2 px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <SparklesIcon className="size-3.5 text-indigo-500" />
            Start with a prompt
          </div>
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <TextareaAutosize
                {...field}
                disabled={isPending}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                minRows={4}
                maxRows={8}
                className="w-full resize-none border-none bg-transparent px-1 py-3 text-base leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed dark:text-zinc-100 dark:placeholder:text-zinc-600"
                placeholder="Describe the website or app you want to create..."
                aria-label="Describe the website or app you want to build"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    form.handleSubmit(onSubmit)(e);
                  }
                }}
              />
            )}
          />
          <div className="flex items-end justify-between gap-2 border-t border-zinc-200/80 pt-3 dark:border-white/10">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <FrameworkSelect
                value={framework}
                onChange={setFramework}
                disabled={isPending}
                className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              />
              <ModelSelect
                value={modelId}
                onChange={setModelId}
                disabled={isPending}
                className="rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              />
              <span className="hidden font-mono text-[10px] text-zinc-400 lg:inline">
                <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 font-mono text-[10px] font-medium text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                  <span>&#8984;</span>Enter
                </kbd>
              </span>
            </div>
            <Button
              type="submit"
              disabled={isButtonDisabled}
              className={cn(
                "size-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-0 text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 hover:from-indigo-500 hover:to-violet-500",
                isButtonDisabled &&
                  "border border-zinc-200 bg-none bg-zinc-200 text-zinc-400 shadow-none dark:border-white/10 dark:bg-white/10 dark:text-zinc-600",
              )}
              aria-label="Create project"
            >
              {isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon />
              )}
            </Button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="mr-1 text-xs text-zinc-400 dark:text-zinc-500">Try an idea</span>
          {PROJECT_TEMPLATES.slice(0, 4).map((template) => (
            <Button
              key={template.title}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-zinc-200/80 bg-white/65 px-3 text-xs font-normal text-zinc-600 shadow-none backdrop-blur hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-zinc-400 dark:hover:border-indigo-400/30 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200"
              onClick={() => onSelect(template.prompt)}
            >
              {template.title.replace(/^Build (an?|a) /, "")}
            </Button>
          ))}
        </div>
      </div>
    </Form>
  );
};
