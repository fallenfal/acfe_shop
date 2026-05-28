export type MemoPriority = "normal" | "important" | "urgent";

export type MemoCategory =
  | "daily_briefing"
  | "policy_update"
  | "equipment"
  | "menu_change"
  | "health_safety"
  | "general";

export interface MemoListItem {
  id: string;
  title: string;
  priority: MemoPriority;
  category: MemoCategory;
  author_name: string;
  is_pinned: boolean;
  is_read: boolean;
  requires_acknowledgement: boolean;
  created_at: string;
  acknowledgement_count: number;
  comment_count: number;
}

export interface AcknowledgementUser {
  id: string;
  name: string;
  acknowledged_at: string | null;
}

export interface MemoComment {
  id: string;
  user: string;
  user_name: string;
  body: string;
  created_at: string;
}

export interface MemoDetail {
  id: string;
  location: string | null;
  organisation: string;
  author: string | null;
  author_name: string;
  title: string;
  body: string;
  priority: MemoPriority;
  category: MemoCategory;
  is_pinned: boolean;
  requires_acknowledgement: boolean;
  target_roles: string[];
  visible_from: string | null;
  visible_until: string | null;
  attachments: string[];
  is_read: boolean;
  created_at: string;
  updated_at: string;
  comments: MemoComment[];
  acknowledged_users: AcknowledgementUser[];
  pending_users: AcknowledgementUser[];
  acknowledgement_count: number;
  comment_count: number;
}

export interface MemoCreatePayload {
  title: string;
  body: string;
  priority: MemoPriority;
  category: MemoCategory;
  is_pinned: boolean;
  requires_acknowledgement: boolean;
  target_roles: string[];
  visible_from: string | null;
  visible_until: string | null;
  attachments?: string[];
  location?: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface MemoFilters {
  category?: MemoCategory | "";
  priority?: MemoPriority | "";
  is_pinned?: boolean;
}
