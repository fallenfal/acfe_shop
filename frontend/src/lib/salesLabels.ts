export const MENU_CATEGORIES: Record<string, string> = {
  hot_drinks: "Hot Drinks",
  cold_drinks: "Cold Drinks",
  food: "Food",
  bakery: "Bakery",
  retail: "Retail",
  other: "Other",
};

export function menuCategoryLabel(category: string | undefined) {
  if (!category) return "Other";
  return MENU_CATEGORIES[category] ?? category.replace(/_/g, " ");
}

export function formatHourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

export const CHART_HOURS = Array.from({ length: 15 }, (_, i) => i + 6);

export const CATEGORY_CHART_COLORS = [
  "#c17f3a",
  "#a66a2f",
  "#d4a574",
  "#8b5e3c",
  "#6b5344",
  "#b8956a",
];

export function todayDateParam() {
  return new Date().toISOString().slice(0, 10);
}
