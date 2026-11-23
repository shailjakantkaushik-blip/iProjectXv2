import { supabase } from "@/integrations/supabase/client";

/** Bell + My Work alert for the person (and their resource manager) when over allocated. */
export async function notifyResourceOverAllocation(opts: {
  resourceId: string;
  title: string;
  body: string;
  link?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("notify_resource_over_allocation", {
    _resource_id: opts.resourceId,
    _title: opts.title,
    _body: opts.body,
    _link: opts.link || "/app/resources?tab=calendars",
  });
  if (error) console.error("over-allocation notify failed", error);
}
