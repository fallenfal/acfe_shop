import type { AdjustmentType, StockCategory } from "../types/inventory";

export const STOCK_CATEGORIES: StockCategory[] = [
  "dairy",
  "coffee_tea",
  "dry_goods",
  "fresh_produce",
  "bakery",
  "meat_fish",
  "beverages",
  "packaging",
  "cleaning",
  "other",
];

const categoryLabels: Record<StockCategory, string> = {
  dairy: "Dairy",
  coffee_tea: "Coffee & Tea",
  dry_goods: "Dry Goods",
  fresh_produce: "Fresh Produce",
  bakery: "Bakery",
  meat_fish: "Meat & Fish",
  beverages: "Beverages",
  packaging: "Packaging",
  cleaning: "Cleaning",
  other: "Other",
};

export function stockCategoryLabel(category: StockCategory | string): string {
  return categoryLabels[category as StockCategory] ?? category;
}

const categoryStyles: Record<StockCategory, string> = {
  dairy: "bg-sky-100 text-sky-900",
  coffee_tea: "bg-amber-100 text-amber-950",
  dry_goods: "bg-yellow-100 text-yellow-950",
  fresh_produce: "bg-green-100 text-green-900",
  bakery: "bg-orange-100 text-orange-950",
  meat_fish: "bg-rose-100 text-rose-950",
  beverages: "bg-cyan-100 text-cyan-950",
  packaging: "bg-stone-200 text-stone-800",
  cleaning: "bg-violet-100 text-violet-900",
  other: "bg-cream-200 text-brown-800",
};

export function stockCategoryStyle(category: StockCategory | string): string {
  return (
    categoryStyles[category as StockCategory] ??
    "bg-cream-200/80 text-brown-700"
  );
}

const unitLabels: Record<string, string> = {
  kg: "kg",
  g: "g",
  l: "L",
  ml: "ml",
  units: "units",
  boxes: "boxes",
  bags: "bags",
};

export function unitLabel(unit: string): string {
  return unitLabels[unit] ?? unit;
}

export function formatQuantity(qty: number, unit: string): string {
  const formatted = Number.isInteger(qty) ? String(qty) : qty.toFixed(1);
  return `${formatted} ${unitLabel(unit)}`;
}

const adjustmentLabels: Record<AdjustmentType, string> = {
  delivery: "Delivery",
  correction: "Correction",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
  waste: "Waste",
  sale_deduction: "Sale",
};

export function adjustmentTypeLabel(type: AdjustmentType | string): string {
  return adjustmentLabels[type as AdjustmentType] ?? type;
}

const adjustmentStyles: Record<string, string> = {
  delivery: "bg-green-100 text-green-900",
  correction: "bg-amber-100 text-amber-950",
  transfer_out: "bg-blue-100 text-blue-900",
  transfer_in: "bg-blue-50 text-blue-800",
  waste: "bg-red-100 text-red-900",
  sale_deduction: "bg-stone-200 text-stone-800",
};

export function adjustmentTypeStyle(type: string): string {
  return adjustmentStyles[type] ?? "bg-cream-200 text-brown-800";
}
