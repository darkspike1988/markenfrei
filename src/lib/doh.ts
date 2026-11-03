/**
 * DNS-over-HTTPS (DoH) Authoritative Verification
 * Serves as a high-reliability fallback when RDAP servers rate-limit (HTTP 429)
 * or return 500/timeout.
 *
 * Querying authoritative nameservers via DoH (Google & Cloudflare) allows verifying
 * whether active NS (Name Server) or SOA records exist for a domain.
 */

export type DohLookupResult = {
  domain: string;
  hasDnsRecords: boolean;
  isNxDomain: boolean;
  status: "taken" | "likely-available" | "unknown";
};

export async function dohLookup(domain: string): Promise<DohLookupResult> {
  const enc = encodeURIComponent(domain);
  const urls = [
    `https://dns.google/resolve?name=${enc}&type=NS`,
    `https://cloudflare-dns.com/dns-query?name=${enc}&type=NS`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const status = typeof data?.Status === "number" ? data.Status : -1;
      const answers = Array.isArray(data?.Answer) ? data.Answer : [];

      // Status 0 = NOERROR
      if (status === 0 && answers.length > 0) {
        return {
          domain,
          hasDnsRecords: true,
          isNxDomain: false,
          status: "taken",
        };
      }

      // Status 3 = NXDOMAIN (Non-Existent Domain)
      if (status === 3) {
        return {
          domain,
          hasDnsRecords: false,
          isNxDomain: true,
          status: "likely-available",
        };
      }
    } catch {
      // Try next provider
    }
  }

  return {
    domain,
    hasDnsRecords: false,
    isNxDomain: false,
    status: "unknown",
  };
}
