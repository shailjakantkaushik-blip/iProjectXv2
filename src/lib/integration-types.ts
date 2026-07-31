export type IntegrationProvider = "jira" | "azure_devops" | "servicenow" | "custom_webhook";

export type IntegrationStatus =
  | "not_configured"
  | "configured"
  | "tested"
  | "active"
  | "error";

export type IntegrationConfig = {
  site_url?: string;
  email?: string;
  /** Jira project keys to sync, e.g. ["IPX", "PMO"] */
  project_keys?: string[];
  /** Where imported issues land */
  map_to?: "work_items" | "demand_pipeline";
  /** jql override; if empty, uses project in (keys) ORDER BY updated DESC */
  jql?: string;
  sync_mode?: "manual" | "scheduled";
};

export type IntegrationPublicStatus = {
  id: string | null;
  org_id: string;
  provider: IntegrationProvider;
  display_name: string | null;
  enabled: boolean;
  config: IntegrationConfig;
  secret_configured: boolean;
  secret_hint: string | null;
  status: IntegrationStatus;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  notes: string | null;
  kek_configured: boolean;
  updated_at: string | null;
};

export const INTEGRATION_PROVIDERS: Array<{
  id: IntegrationProvider;
  label: string;
  description: string;
  available: boolean;
}> = [
  {
    id: "jira",
    label: "Jira Cloud / Data Center",
    description:
      "Import issues into Work Items or Demand Pipeline. Uses Atlassian API token (email + token).",
    available: true,
  },
  {
    id: "azure_devops",
    label: "Azure DevOps",
    description: "Work item sync (coming soon — configure placeholder).",
    available: false,
  },
  {
    id: "servicenow",
    label: "ServiceNow",
    description: "ITSM demand intake (coming soon).",
    available: false,
  },
  {
    id: "custom_webhook",
    label: "Custom webhook",
    description: "Inbound JSON webhook for custom middleware (coming soon).",
    available: false,
  },
];
