export type DateCheckStatus = "in_progress" | "completed";

export type ExpiryStatus = "ok" | "warning" | "critical" | "expired";

export type AlertLevel = "warning" | "critical" | "expired";

export type EntryAction =
  | "none"
  | "use_first"
  | "reduce_price"
  | "dispose"
  | "disposed";

export type AlertResolution =
  | "pending"
  | "used"
  | "disposed"
  | "wasted"
  | "rechecked"
  | "dismissed";

export type ScheduleFrequency =
  | "daily"
  | "every_other_day"
  | "twice_weekly"
  | "weekly";

export interface DateCheckSummary {
  id: string;
  location_name: string;
  conducted_by_name: string | null;
  status: DateCheckStatus;
  items_checked: number;
  items_expired: number;
  items_expiring_soon: number;
  started_at: string;
  completed_at: string | null;
}

export interface DateCheckEntry {
  id: string;
  date_check: string;
  stock_item: string | null;
  stock_item_id: string | null;
  menu_item: string | null;
  menu_item_id: string | null;
  product_name: string;
  earliest_expiry: string;
  quantity_at_risk: number;
  unit: string;
  estimated_cost: string;
  expiry_status: ExpiryStatus;
  action_taken: EntryAction;
  action_note: string;
  photo: string | null;
  days_until_expiry: number;
  created_at: string;
}

export interface DateCheckDetail extends DateCheckSummary {
  notes: string;
  conducted_by: string | null;
  entries: DateCheckEntry[];
}

export interface DateCheckEntryInput {
  stock_item_id?: string;
  menu_item_id?: string;
  product_name?: string;
  earliest_expiry: string;
  quantity_at_risk?: number;
  unit?: string;
  action_taken?: EntryAction;
  action_note?: string;
  photo?: File | null;
}

export interface ExpiryAlert {
  id: string;
  location: string;
  date_check_entry: string;
  product_name: string;
  expiry_date: string;
  quantity_at_risk: number;
  estimated_cost: string;
  alert_level: AlertLevel;
  alert_level_display: string;
  resolution: AlertResolution;
  resolution_display: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolved_note: string;
  waste_entry: string | null;
  days_until_expiry: number;
  created_at: string;
}

export interface ExpiryAlertSummary {
  expired: number;
  critical: number;
  warning: number;
  total_cost_at_risk: number | string;
}

export interface DateCheckSchedule {
  id: string;
  location: string;
  location_name: string;
  frequency: ScheduleFrequency;
  alert_threshold_days: number;
  reminder_enabled: boolean;
  reminder_time: string;
  last_check_at: string | null;
  is_overdue: boolean;
  updated_at: string;
}

export interface DateCheckScheduleStatus {
  frequency: ScheduleFrequency;
  last_check_at: string | null;
  is_overdue: boolean;
  hours_since_last_check: number | null;
  next_check_due: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DateCheckFilters {
  status?: DateCheckStatus;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export interface ExpiryAlertFilters {
  alert_level?: AlertLevel;
  resolution?: AlertResolution;
  page?: number;
}
