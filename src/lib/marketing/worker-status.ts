/**
 * Plain-English state of the self-hosted Wan 2.2 worker, for the founder console.
 */
/** Plain-English state of the self-hosted Wan 2.2 worker. */
export function workerStatusLabel(worker: { configured: boolean; status: string }): string {
  if (!worker.configured) return "Not configured";
  switch (worker.status) {
    case "AVAILABLE":
      return "Connected";
    case "BUSY":
      return "Connected (busy)";
    case "MODEL_LOADING":
      return "Connected (loading the model)";
    case "AUTH_FAILED":
      return "Authentication failed";
    case "OFFLINE":
      return "Offline";
    default:
      return "Worker error";
  }
}
