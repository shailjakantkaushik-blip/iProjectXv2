import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeading } from "@/components/streamlit";
import { AppFlowGuide, isAboutTab, type AboutTab } from "@/components/guides/app-flow-guide";

export const Route = createFileRoute("/_authenticated/app/about")({
  validateSearch: (s: Record<string, unknown>): { tab?: AboutTab } => {
    const raw = String(s.tab || "");
    if (isAboutTab(raw)) return { tab: raw };
    return {};
  },
  component: AboutPage,
});

function AboutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab: AboutTab = search.tab || "overview";

  return (
    <div className="space-y-5">
      <PageHeading
        icon="ℹ️"
        title="How this app works"
        subtitle="A plain-language tour: process flow, building blocks, money, people, and gates."
      />
      <AppFlowGuide
        tab={tab}
        onTab={(next) =>
          void navigate({
            to: "/app/about",
            search: next === "overview" ? {} : { tab: next },
          })
        }
      />
    </div>
  );
}
