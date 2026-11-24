import os from "node:os";

/** IPv4 LAN addresses so a tablet on the same network can open the demo. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if ((family === "IPv4" || family === "4") && !addr.internal) {
        out.push(addr.address);
      }
    }
  }
  return out;
}

export function lanUrls(port = process.env.PORT ?? "3000"): string[] {
  return lanAddresses().map((ip) => `http://${ip}:${port}`);
}
