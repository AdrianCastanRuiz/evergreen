import { ApiError, NetworkError } from "@/lib/api";

export function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || "Something went wrong. Please try again.";
  }
  if (err instanceof NetworkError) {
    return "No network connection. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
