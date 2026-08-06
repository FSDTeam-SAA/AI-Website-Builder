"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DownloadIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type FileCollection = Record<string, string>;

interface Props {
  files: FileCollection;
  title: string;
}

const toSafeName = (value: string) => {
  const name = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return name || "vibe-project";
};

const toSafePath = (value: string) => {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
};

export const FragmentDownloadButton = ({ files, title }: Props) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading || Object.keys(files).length === 0) return;

    setIsDownloading(true);

    try {
      const { default: JSZip } = await import("jszip");
      const projectName = toSafeName(title);
      const zip = new JSZip();
      const projectFolder = zip.folder(projectName);

      if (!projectFolder) {
        throw new Error("Unable to create the project archive");
      }

      for (const [path, content] of Object.entries(files)) {
        const safePath = toSafePath(path);

        if (safePath) {
          projectFolder.file(safePath, content);
        }
      }

      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = `${projectName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      toast.success("Project ZIP downloaded");
    } catch (error) {
      console.error("Unable to download project ZIP", error);
      toast.error("Unable to download the project ZIP");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDownload}
      disabled={isDownloading || Object.keys(files).length === 0}
      aria-label="Download project code as a ZIP file"
    >
      {isDownloading ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        <DownloadIcon />
      )}
      <span className="hidden sm:inline">
        {isDownloading ? "Preparing..." : "Download ZIP"}
      </span>
    </Button>
  );
};
