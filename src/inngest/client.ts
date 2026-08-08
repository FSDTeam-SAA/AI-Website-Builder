import { EventSchemas, Inngest } from "inngest";

import type { VibeEvents } from "./types";

export const inngest = new Inngest({
  id: "vibe",
  schemas: new EventSchemas().fromRecord<VibeEvents>(),
});
