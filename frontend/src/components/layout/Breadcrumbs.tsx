import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  memos: "Memos",
  "memo-new": "New memo",
  inventory: "Inventory",
  "stock-take": "Stock take",
  waste: "Waste",
  "date-checks": "Date Checks",
  training: "Training",
  new: "New programme",
  edit: "Edit programme",
  progress: "Staff progress",
  settings: "Settings",
};

function labelForSegment(segment: string, prev: string | undefined) {
  if (segment === "new" && prev === "memos") return "New memo";
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (prev === "memos") return "Memo";
  if (prev === "inventory") return "Stock item";
  if (prev === "date-checks" && segment !== "new" && segment !== "settings")
    return "Check detail";
  if (prev === "training" && segment !== "new" && segment !== "edit" && segment !== "progress")
    return "Programme";
  return segment;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs: { label: string; path: string }[] = [];
  let path = "";
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    path += `/${segment}`;
    const prev = segments[i - 1];
    crumbs.push({
      label: labelForSegment(segment, prev),
      path,
    });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-cream-200 bg-white/60 px-4 py-2.5 lg:px-8"
    >
      <ol className="flex flex-wrap items-center gap-1 text-sm text-brown-600">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cream-200" />
              )}
              {isLast ? (
                <span className="font-medium text-brown-900">{crumb.label}</span>
              ) : (
                <Link
                  to={crumb.path}
                  className="hover:text-amber-brand-dark"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
