export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "network"
  | "timeout"
  | "rate_limit"
  | "database"
  | "storage"
  | "external_dependency"
  | "malformed_response"
  | "internal";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "REQUEST_TIMEOUT"
  | "RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "STORAGE_ERROR"
  | "EXTERNAL_DEPENDENCY_ERROR"
  | "MALFORMED_RESPONSE"
  | "INTERNAL_ERROR";

export type ClassifiedError = {
  category: ErrorCategory;
  code: ErrorCode;
  retryable: boolean;
  message: string;
  dependency?: string;
};

export function classifyError(error: unknown, dependency?: string): ClassifiedError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (name === "AbortError" || message.includes("timeout")) {
    return { category: "timeout", code: "REQUEST_TIMEOUT", retryable: true, message: "The request timed out.", dependency };
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("offline")) {
    return { category: "network", code: "NETWORK_ERROR", retryable: true, message: "A network connection is required.", dependency };
  }
  if (message.includes("401") || message.includes("unauthorized")) {
    return { category: "authentication", code: "AUTH_REQUIRED", retryable: false, message: "Please sign in again.", dependency };
  }
  if (message.includes("403") || message.includes("forbidden")) {
    return { category: "authorization", code: "FORBIDDEN", retryable: false, message: "You do not have permission for this action.", dependency };
  }
  if (message.includes("429") || message.includes("rate limit")) {
    return { category: "rate_limit", code: "RATE_LIMITED", retryable: true, message: "Too many requests. Please try again later.", dependency };
  }
  if (message.includes("database") || message.includes("supabase") || message.includes("quota store")) {
    return { category: "database", code: "DATABASE_UNAVAILABLE", retryable: true, message: "This service is temporarily unavailable.", dependency };
  }
  if (message.includes("storage") || message.includes("upload")) {
    return { category: "storage", code: "STORAGE_ERROR", retryable: true, message: "The image could not be saved.", dependency };
  }
  if (message.includes("malformed") || message.includes("invalid response")) {
    return { category: "malformed_response", code: "MALFORMED_RESPONSE", retryable: false, message: "The service returned an unexpected response.", dependency };
  }
  if (dependency) {
    return { category: "external_dependency", code: "EXTERNAL_DEPENDENCY_ERROR", retryable: true, message: "A supporting service is temporarily unavailable.", dependency };
  }
  return { category: "internal", code: "INTERNAL_ERROR", retryable: false, message: "Something went wrong. Please try again.", dependency };
}