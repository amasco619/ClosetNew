import { classifyError, ClassifiedError } from "./error-codes";

export type ErrorReport = {
  category: ClassifiedError["category"];
  code: ClassifiedError["code"];
  operation: string;
  dependency?: string;
  route?: string;
  status?: number;
  retryable?: boolean;
  requestId?: string;
  durationMs?: number;
  errorType?: string;
};

function safeReport(report: ErrorReport): ErrorReport {
  return {
    category: report.category,
    code: report.code,
    operation: report.operation.slice(0, 80),
    ...(report.dependency ? { dependency: report.dependency.slice(0, 40) } : {}),
    ...(report.route ? { route: report.route.slice(0, 120) } : {}),
    ...(typeof report.status === "number" ? { status: report.status } : {}),
    ...(typeof report.retryable === "boolean" ? { retryable: report.retryable } : {}),
    ...(report.requestId ? { requestId: report.requestId.slice(0, 100) } : {}),
    ...(typeof report.durationMs === "number" ? { durationMs: Math.max(0, Math.round(report.durationMs)) } : {}),
    ...(report.errorType ? { errorType: report.errorType.slice(0, 40) } : {}),
  };
}

export function reportError(error: unknown, operation: string, context: Partial<ErrorReport> = {}): void {
  const classified = classifyError(error, context.dependency);
  const report = safeReport({
    category: context.category ?? classified.category,
    code: context.code ?? classified.code,
    operation,
    dependency: context.dependency ?? classified.dependency,
    route: context.route,
    status: context.status,
    retryable: context.retryable ?? classified.retryable,
    requestId: context.requestId,
    durationMs: context.durationMs,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  try {
    console.error(JSON.stringify({ type: "error", ...report }));
  } catch {
    // Observability must never break the application or the error fallback.
  }
}