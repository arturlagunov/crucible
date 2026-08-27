export function norm(p: string | undefined): string {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}
