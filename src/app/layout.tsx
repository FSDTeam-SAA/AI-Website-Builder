import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOVYA Website Builder",
  description: "Build, edit and publish your business website with NOVYA.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body className="antialiased">{children}</body></html>;
}
