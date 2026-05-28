export type WasteReason =
  | "over_production"
  | "expired"
  | "customer_return"
  | "dropped_spillage"
  | "equipment_failure"
  | "quality_issue"
  | "other";

export type WasteShift = "morning" | "afternoon" | "evening";

export type WasteItemType = "menu_item" | "stock_item";

export interface WasteEntry {
  id: string;
  location: string;
  item_type: WasteItemType;
  menu_item: string | null;
  menu_item_name: string | null;
  stock_item: string | null;
  stock_item_name: string | null;
  quantity: number;
  unit: string;
  reason: WasteReason;
  reason_display: string;
  reason_note: string;
  shift: WasteShift;
  shift_display: string;
  cost_value: string;
  photo: string | null;
  logged_by: string | null;
  logged_by_name: string | null;
  logged_at: string;
}

export interface WasteFilters {
  date_from?: string;
  date_to?: string;
  reason?: string;
  reason_group?: "expired" | "other";
  shift?: string;
  item_type?: string;
  page?: number;
  page_size?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface WasteExpiredBreakdown {
  expired: { total_cost: number; count: number };
  other: { total_cost: number; count: number };
}

export interface WasteSummary {
  period_start: string;
  period_end: string;
  total_waste_cost: number;
  total_waste_count: number;
  total_revenue: number;
  waste_by_reason: {
    reason: string;
    total_cost: number;
    count: number;
  }[];
  waste_by_item: {
    item_name: string;
    item_type: string;
    total_cost: number;
    count: number;
  }[];
  waste_by_shift: {
    shift: string;
    total_cost: number;
    count: number;
  }[];
  waste_expired_breakdown?: WasteExpiredBreakdown;
  waste_as_percentage_of_revenue: number | null;
}

export interface WasteTrendPoint {
  date: string;
  total_cost: number;
  count: number;
}

export interface WasteTrends {
  days: number;
  data: WasteTrendPoint[];
}

export type WastePeriodPreset = "week" | "month" | "last30" | "custom";
