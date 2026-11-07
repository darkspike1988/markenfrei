export function Chip({
  pressed,
  onClick,
  disabled,
  children,
  mono,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  mono?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-8 items-center rounded-md border px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        mono ? "font-mono" : ""
      } ${
        pressed
          ? "border-button bg-button text-button-ink hover:bg-button-hover"
          : "border-line-strong bg-surface text-soft hover:border-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
