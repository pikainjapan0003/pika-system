export function assertPocDatabase() {
  let url;
  try { url = new URL(process.env.DATABASE_URL ?? "invalid:"); } catch {
    throw new Error("A dedicated POC database connection is required");
  }
  // Set this only from the newly provisioned test service's private hostname.
  // Keep the existing synthetic database/user names and reject arbitrary URLs.
  const cloudHost = process.env.PIKA_POC_DATABASE_HOST;
  const pinnedCloud = process.env.PIKA_PRIVATE_POC === "true" &&
    /^[a-z0-9-]+\.railway\.internal$/.test(cloudHost ?? "") &&
    url.hostname === cloudHost;
  if (url.protocol !== "postgresql:" || (!pinnedCloud && url.hostname !== "db") ||
      url.pathname !== "/pika_sites_poc" || url.username !== "pika_poc") {
    throw new Error("This command only accepts the dedicated local or pinned online POC database");
  }
}
