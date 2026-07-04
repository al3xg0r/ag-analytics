// Minimal User-Agent parser.
// A full library like ua-parser-js would add unnecessary weight to the Worker,
// so this covers the browsers/systems/devices listed in the project spec only.

export function parseBrowser(ua) {
  if (!ua) return "Unknown";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Brave/.test(ua)) return "Brave";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/CriOS/.test(ua)) return "Chrome"; // Chrome on iOS
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

export function parseOS(ua) {
  if (!ua) return "Unknown";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

export function parseDeviceType(ua) {
  if (!ua) return "Desktop";
  if (/iPad|Tablet/.test(ua)) return "Tablet";
  if (/Mobi|Android.*Mobile|iPhone/.test(ua)) return "Phone";
  return "Desktop";
}
