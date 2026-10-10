/** Public recipient details only. Never put payment-provider API secrets here. */
export type SupportConfig = {pixCode: string | null; internationalUrl: string | null};

function fields(source: Uint8Array): Map<string, string> | null {
  const result = new Map<string, string>();
  const decoder = new TextDecoder("utf-8", {fatal: true});
  try {
    for (let position = 0; position < source.length;) {
      const header = decoder.decode(source.slice(position, position + 4));
      if (!/^\d{4}$/.test(header)) return null;
      const tag = header.slice(0, 2), length = Number(header.slice(2));
      position += 4;
      if (!length || position + length > source.length || result.has(tag)) return null;
      result.set(tag, decoder.decode(source.slice(position, position + length)));
      position += length;
    }
    return result;
  } catch {return null;}
}

/** Checks BR Code structure and CRC; recipient ownership is confirmed by the owner/bank. */
export function validatePixCode(value?: string): string | null {
  const code = value?.trim();
  if (!code || code.length > 4096 || /[\r\n\0]/.test(code) || !code.startsWith("000201") || !/6304[0-9A-F]{4}$/.test(code)) return null;
  const bytes = new TextEncoder().encode(code);
  const data = fields(bytes);
  if (!data || data.get("00") !== "01" || data.get("53") !== "986" || data.get("58") !== "BR" || !data.get("59") || !data.get("60")) return null;
  const pixAccount = [...data].some(([tag, content]) => Number(tag) >= 26 && Number(tag) <= 51 && fields(new TextEncoder().encode(content))?.get("00")?.toLowerCase() === "br.gov.bcb.pix");
  if (!pixAccount) return null;
  let crc = 0xffff;
  for (const byte of bytes.slice(0, -4)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0") === data.get("63") ? code : null;
}

export function validateSupportUrl(value?: string): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const hasDestination = url.pathname !== "/";
    const allowed = ((host === "ko-fi.com" || host === "www.ko-fi.com" || host === "paypal.me" || host === "www.paypal.me") && hasDestination)
      || (host === "buy.stripe.com" && hasDestination)
      || ((host === "www.paypal.com" || host === "paypal.com") && /^\/(?:[a-z]{2}\/)?(?:donate|ncp\/payment)(?:\/|$)/.test(url.pathname));
    return allowed ? url.href : null;
  } catch {return null;}
}

export function makeSupportConfig(pix?: string, international?: string): SupportConfig | null {
  const pixCode = validatePixCode(pix), internationalUrl = validateSupportUrl(international);
  return pixCode || internationalUrl ? {pixCode, internationalUrl} : null;
}

export function getSupportConfig(): SupportConfig | null {
  // Direct references are required for Next's public build-time replacement.
  return makeSupportConfig(process.env.NEXT_PUBLIC_SUPPORT_PIX_CODE, process.env.NEXT_PUBLIC_SUPPORT_URL);
}
