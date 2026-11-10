/** Umschalter mit aria-pressed; Aussehen und Zustände stehen in globals.css (.chip). */
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
      className={`chip ${mono ? "font-mono" : ""}`}
    >
      {children}
    </button>
  );
}
