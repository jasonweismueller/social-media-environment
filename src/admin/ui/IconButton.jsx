import React from "react";
import { Button } from "./Button";

export function IconButton({ children, size = "md", ...rest }) {
  return (
    <Button variant="ghost" size={size} iconOnly {...rest}>
      {children}
    </Button>
  );
}
