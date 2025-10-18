import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind's merge strategy
 * This allows for conditional and dynamic class names in a type-safe way
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}