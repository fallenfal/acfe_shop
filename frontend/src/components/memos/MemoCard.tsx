import { Link } from "react-router-dom";
import { MessageCircle, Pin } from "lucide-react";
import { formatRelativeTime } from "../../lib/format";
import type { MemoListItem } from "../../types/memo";
import { Avatar } from "../ui/Avatar";
import { CategoryTag } from "./CategoryTag";
import { PriorityBadge } from "./PriorityBadge";

interface Props {
  memo: MemoListItem;
  /** Total staff expected to acknowledge (from detail); omit on feed if unknown */
  acknowledgementTotal?: number;
}

export function MemoCard({ memo, acknowledgementTotal }: Props) {
  const ackTotal = acknowledgementTotal ?? 0;
  const ackPercent =
    ackTotal > 0
      ? Math.min(100, Math.round((memo.acknowledgement_count / ackTotal) * 100))
      : memo.acknowledgement_count > 0
        ? 50
        : 0;

  return (
    <Link
      to={`/memos/${memo.id}`}
      className={`group block rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        memo.is_read
          ? "border-cream-200"
          : "border-amber-brand/40 ring-1 ring-amber-brand/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {memo.is_pinned && (
              <Pin
                className="h-4 w-4 shrink-0 fill-amber-brand text-amber-brand"
                aria-label="Pinned"
              />
            )}
            <PriorityBadge priority={memo.priority} />
            <CategoryTag category={memo.category} />
          </div>
          <h3 className="font-display text-lg font-bold text-brown-900 group-hover:text-amber-brand-dark">
            {memo.title}
          </h3>
        </div>
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            memo.is_read ? "bg-stone-300" : "bg-amber-brand"
          }`}
          title={memo.is_read ? "Read" : "Unread"}
          aria-label={memo.is_read ? "Read" : "Unread"}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Avatar name={memo.author_name} size="sm" />
        <div className="min-w-0 text-sm text-brown-600">
          <span className="font-medium text-brown-800">{memo.author_name}</span>
          <span className="mx-1.5 text-cream-200">·</span>
          <time dateTime={memo.created_at}>
            {formatRelativeTime(memo.created_at)}
          </time>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-brown-600">
        {memo.requires_acknowledgement && (
          <div className="min-w-[140px] flex-1">
            <div className="mb-1 flex justify-between">
              <span>Read</span>
              <span className="font-medium text-brown-800">
                {memo.acknowledgement_count}
                {ackTotal > 0 ? `/${ackTotal}` : " read"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cream-200">
              <div
                className="h-full rounded-full bg-amber-brand transition-all"
                style={{ width: `${ackPercent}%` }}
              />
            </div>
          </div>
        )}
        {memo.comment_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            {memo.comment_count}
          </span>
        )}
      </div>
    </Link>
  );
}
