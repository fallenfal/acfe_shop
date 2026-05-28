export interface SalesDayMetrics {
  total_revenue: number;
  transaction_count: number;
  average_transaction: number;
  waste_percentage?: number;
  vs_last_week: {
    revenue_change_pct: number;
    transaction_change_pct: number;
  };
  vs_last_year: {
    revenue_change_pct: number;
  };
}

export interface HourlyBreakdownRow {
  hour: number;
  revenue: number;
  transactions: number;
}

export interface SalesItemRow {
  item_id: string | null;
  name: string;
  quantity: number;
  revenue: number;
  category?: string;
}

export interface CategoryBreakdownRow {
  category: string;
  revenue: number;
  quantity: number;
}

export interface SalesDashboard {
  date: string;
  today: SalesDayMetrics;
  hourly_breakdown: HourlyBreakdownRow[];
  top_items: SalesItemRow[];
  category_breakdown: CategoryBreakdownRow[];
  slow_movers: SalesItemRow[];
  aggregated?: boolean;
}

export interface SalesTrendPoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface SalesTrends {
  period: string;
  days: number;
  data: SalesTrendPoint[];
}

export interface ProductPerformance {
  date_from: string;
  date_to: string;
  category: string | null;
  items: SalesItemRow[];
}

export interface OrgSalesLocationRow {
  location_id: string;
  location_name: string;
  total_revenue: number;
  transaction_count: number;
  average_transaction: number;
  waste_percentage: number;
}

export interface OrgSalesComparison {
  period_start: string;
  period_end: string;
  locations: OrgSalesLocationRow[];
}

export type TrendsPeriod = "7d" | "30d" | "90d";
export type LeaderboardMetric = "revenue" | "average_transaction";
