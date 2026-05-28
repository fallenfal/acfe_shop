import { initials } from "../../lib/format";

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-2 ring-cream-200`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-brown-700 font-semibold text-cream-50 ring-2 ring-cream-200`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
