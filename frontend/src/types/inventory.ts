export type StockCategory =
  | "dairy"
  | "coffee_tea"
  | "dry_goods"
  | "fresh_produce"
  | "bakery"
  | "meat_fish"
  | "beverages"
  | "packaging"
  | "cleaning"
  | "other";

export type AdjustmentType =
  | "delivery"
  | "correction"
  | "transfer_out"
  | "transfer_in"
  | "waste"
  | "sale_deduction";

export type StockExpiryStatus = "ok" | "warning" | "critical" | "expired";

export interface StockItemDateCheckHistory {
  id: string;
  check_date: string;
  earliest_expiry: string;
  expiry_status: StockExpiryStatus;
  action_taken: string;
  action_taken_display: string;
}

export interface StockListItem {
  id: string;
  stock_item_id: string;
  name: string;
  category: StockCategory;
  unit: string;
  current_quantity: number;
  par_level: number;
  unit_cost: string;
  is_below_par: boolean;
  stock_value: number;
  last_counted_at: string | null;
  updated_at: string;
  latest_expiry_date?: string | null;
  latest_expiry_status?: StockExpiryStatus | null;
}

export interface StockAdjustment {
  id: string;
  stock_item: string;
  stock_item_name: string;
  adjustment_type: AdjustmentType;
  quantity_change: number;
  related_location: string | null;
  related_location_name: string | null;
  notes: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface StockDetail extends StockListItem {
  adjustments: StockAdjustment[];
}

export interface StockFilters {
  category?: string;
  below_par?: boolean;
  sort?: string;
}

export interface AdjustStockPayload {
  stock_item_id: string;
  adjustment_type: "delivery" | "correction" | "transfer_out";
  quantity?: number;
  quantity_change?: number;
  related_location_id?: string;
  notes?: string;
}

export interface StockTakeSummary {
  id: string;
  conducted_at: string;
  conducted_by: string | null;
  conducted_by_name: string | null;
  notes: string;
  items_counted: number;
  total_variance: number;
}

export interface StockTakeEntry {
  id: string;
  stock_item: string;
  stock_item_name: string;
  stock_item_category: StockCategory;
  stock_item_unit: string;
  counted_quantity: number;
  expected_quantity: number | null;
  variance: number | null;
}

export interface StockTakeDetail extends StockTakeSummary {
  entries: StockTakeEntry[];
}

export interface StockTakeEntryInput {
  stock_item_id: string;
  counted_quantity: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
