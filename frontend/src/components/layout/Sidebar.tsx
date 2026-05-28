import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Coffee,
  Megaphone,
  Package,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { fetchTrainingNavBadge } from "../../api/training";
import type { TrainingNavBadge } from "../../types/training";
import { fetchDateCheckNavBadge, type DateCheckNavBadge } from "../../api/datechecks";
import { fetchStockAlerts } from "../../api/inventory";
import { fetchUnreadCount } from "../../api/memos";
import { ALL_LOCATIONS_ID, useLocation } from "../../contexts/LocationContext";
import { useIsCmOrAbove } from "../../hooks/usePermission";
import { LocationSwitcher } from "./LocationSwitcher";
import { SidebarUser } from "./SidebarUser";

function NavItem({
  to,
  icon,
  label,
  badge,
  badgeTone = "red",
  onNavigate,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number;
  badgeTone?: "red" | "amber";
  onNavigate?: () => void;
}) {
  const badgeClass =
    badgeTone === "amber"
      ? "bg-amber-500"
      : "bg-red-600";

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "bg-amber-brand/15 text-amber-brand-dark"
            : "text-brown-700 hover:bg-cream-100 hover:text-brown-900"
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold text-white ${badgeClass}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locationId, locationRevision } = useLocation();
  const showSettings = useIsCmOrAbove();
  const [unreadMemos, setUnreadMemos] = useState(0);
  const [belowParCount, setBelowParCount] = useState(0);
  const [dateCheckBadge, setDateCheckBadge] = useState<DateCheckNavBadge>({
    count: 0,
    tone: "hidden",
  });
  const [trainingBadge, setTrainingBadge] = useState<TrainingNavBadge>({
    count: 0,
    tone: "hidden",
  });

  useEffect(() => {
    if (!locationId || locationId === ALL_LOCATIONS_ID) {
      setUnreadMemos(0);
      setBelowParCount(0);
      setDateCheckBadge({ count: 0, tone: "hidden" });
      setTrainingBadge({ count: 0, tone: "hidden" });
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchUnreadCount(locationId).catch(() => ({ count: 0 })),
      fetchStockAlerts(locationId).catch(() => []),
      fetchDateCheckNavBadge(locationId).catch(() => ({
        count: 0,
        tone: "hidden" as const,
      })),
      fetchTrainingNavBadge(locationId).catch(() => ({
        count: 0,
        tone: "hidden" as const,
      })),
    ]).then(([unread, alerts, dateBadge, trainingNav]) => {
      if (cancelled) return;
      setUnreadMemos(unread.count);
      setBelowParCount(alerts.length);
      setDateCheckBadge(dateBadge);
      setTrainingBadge(trainingNav);
    });
    return () => {
      cancelled = true;
    };
  }, [locationId, locationRevision]);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-cream-200 bg-white shadow-lg transition-transform duration-200 ease-out lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-cream-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <Coffee className="h-7 w-7 text-amber-brand" aria-hidden />
          <div>
            <p className="font-display text-base font-bold leading-tight text-brown-900">
              ACFE Shop
            </p>
            <p className="text-[10px] uppercase tracking-wide text-brown-600">
              Operations
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-brown-600 hover:bg-cream-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-cream-200 px-3 py-3">
        <LocationSwitcher compact />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <NavItem
          to="/dashboard"
          icon={<BarChart3 className="h-5 w-5" />}
          label="Dashboard"
          onNavigate={onClose}
        />
        <NavItem
          to="/memos"
          icon={<Megaphone className="h-5 w-5" />}
          label="Memos"
          badge={unreadMemos}
          onNavigate={onClose}
        />
        <NavItem
          to="/inventory"
          icon={<Package className="h-5 w-5" />}
          label="Inventory"
          badge={belowParCount}
          onNavigate={onClose}
        />
        <NavItem
          to="/waste"
          icon={<Trash2 className="h-5 w-5" />}
          label="Waste"
          onNavigate={onClose}
        />
        <NavItem
          to="/date-checks"
          icon={<CalendarCheck className="h-5 w-5" />}
          label="Date Checks"
          badge={dateCheckBadge.tone === "hidden" ? undefined : dateCheckBadge.count}
          badgeTone={dateCheckBadge.tone === "amber" ? "amber" : "red"}
          onNavigate={onClose}
        />
        <NavItem
          to="/training"
          icon={<BookOpen className="h-5 w-5" />}
          label="Training"
          badge={
            trainingBadge.tone === "hidden" ? undefined : trainingBadge.count
          }
          badgeTone={trainingBadge.tone === "amber" ? "amber" : "red"}
          onNavigate={onClose}
        />
        {showSettings && (
          <NavItem
            to="/settings"
            icon={<Settings className="h-5 w-5" />}
            label="Settings"
            onNavigate={onClose}
          />
        )}
      </nav>

      <SidebarUser onNavigate={onClose} />
    </aside>
  );
}
