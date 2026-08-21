import React from "react";

const SIZES = {
  sm: { height: 30, padding: "0 10px", fontSize: 12, gap: 5 },
  md: { height: 36, padding: "0 14px", fontSize: 13, gap: 6 },
};

const VARIANTS = {
  primary: {
    background: "var(--admin-accent)",
    borderColor: "var(--admin-accent)",
    color: "#fff",
  },
  secondary: {
    background: "var(--admin-surface)",
    borderColor: "var(--admin-border)",
    color: "var(--admin-text)",
  },
  ghost: {
    background: "transparent",
    borderColor: "transparent",
    color: "var(--admin-text)",
  },
  danger: {
    background: "var(--admin-surface)",
    borderColor: "var(--admin-danger-border)",
    color: "var(--admin-danger-ink)",
  },
};

function Spinner({ size = 12 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        opacity: 0.7,
        animation: "admin-spin 0.7s linear infinite",
      }}
    />
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  disabled = false,
  iconOnly = false,
  children,
  style,
  className,
  title,
  onClick,
  type = "button",
  ...rest
}) {
  const sizeStyle = SIZES[size] || SIZES.md;
  const variantStyle = VARIANTS[variant] || VARIANTS.secondary;
  const isDisabled = disabled || busy;

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={isDisabled}
      className={["admin-btn", className].filter(Boolean).join(" ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: sizeStyle.gap,
        height: sizeStyle.height,
        padding: iconOnly ? 0 : sizeStyle.padding,
        width: iconOnly ? sizeStyle.height : undefined,
        borderRadius: "var(--admin-radius-sm)",
        border: "1px solid",
        fontSize: sizeStyle.fontSize,
        fontWeight: 600,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...variantStyle,
        ...style,
      }}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export { Spinner };
