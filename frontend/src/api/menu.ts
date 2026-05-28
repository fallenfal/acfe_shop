import { apiRequest } from "./client";

export interface MenuItemOption {
  id: string;
  name: string;
  category: string;
  ingredient_cost: string;
  price: string;
}

export async function fetchMenuItems() {
  const data = await apiRequest<
    MenuItemOption[] | { results: MenuItemOption[] }
  >("/api/org/menu-items/");
  return Array.isArray(data) ? data : (data.results ?? []);
}
