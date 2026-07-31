import React from "react";

/**
 * Thin styling wrapper around native <table> elements — not a data-grid
 * abstraction. Keeps consistent cell padding/border across admin pages
 * without changing how rows/cells are composed by callers.
 */
export function Table({ children, style }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          ...style,
        }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ children, style, ...rest }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "8px 10px",
        fontSize: 11,
        fontWeight: 700,
        color: "var(--admin-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.3,
        borderBottom: "1px solid var(--admin-border-subtle)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({ children, style, ...rest }) {
  return (
    <td
      style={{
        padding: "10px",
        borderBottom: "1px solid var(--admin-border-subtle)",
        verticalAlign: "middle",
        color: "var(--admin-text)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, style, ...rest }) {
  return (
    <tr style={style} {...rest}>
      {children}
    </tr>
  );
}
