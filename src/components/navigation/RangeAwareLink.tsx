"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function RangeAwareLink({
  href,
  className,
  title,
  children
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const current = useSearchParams();
  const preserved = new URLSearchParams();
  for (const key of ["range", "start", "end"]) {
    const value = current.get(key);
    if (value) preserved.set(key, value);
  }
  const query = preserved.toString();
  const destination = query ? `${href}${href.includes("?") ? "&" : "?"}${query}` : href;

  return <Link href={destination} className={className} title={title}>{children}</Link>;
}
