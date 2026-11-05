import { WebsiteBuilder } from "@/modules/website-builder/website-builder";
import "./website-builder.css";
import "./website-hub.css";
import "./website-editor-tools.css";
import "./website-board-media.css";

export const metadata = { title: "Website Builder | NOVYA" };
export default function Page() {
  return <WebsiteBuilder />;
}
