import { supabase } from "@/integrations/supabase/client";

/** Bell + My Work alert for the person (and their resource manager) when over allocated. */
export async function notifyResourceOverAllocation(resourceId: string): Promise<void> {
  const { error } = await supabase.rpc("notify_resource_over_allocation", {
    _resource_id: resourceId,
  });
  if (error) console.error("over-allocation notify failed", error);
}
