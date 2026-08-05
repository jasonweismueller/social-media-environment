import React from "react";
import { Button } from "./Button";

export function IconButton({ children, size = "md", danger = false, ...rest }) {
  return (
    <Button variant={danger ? "danger" : "ghost"} size={size} iconOnly {...rest}>
      {children}
    </Button>
  );
}
