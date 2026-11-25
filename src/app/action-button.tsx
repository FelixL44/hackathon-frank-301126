"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

export function ActionButton({ children, pendingLabel, ...props }: ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" {...props} disabled={pending || props.disabled}>{pending && pendingLabel ? pendingLabel : children}</button>;
}
