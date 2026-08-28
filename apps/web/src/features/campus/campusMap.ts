export function campusMapHref(item?: {
  mapUrl?: string;
  latitude?: number;
  longitude?: number;
} | null): string {
  if (!item) return '';
  if (item.mapUrl) return item.mapUrl;
  if (item.latitude != null && item.longitude != null) {
    return `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
  }
  return '';
}

export function campusMapEmbedSrc(item?: {
  isPrimary?: boolean;
  latitude?: number;
  longitude?: number;
} | null): string {
  if (!item || item.isPrimary) return '';
  if (item.latitude != null && item.longitude != null) {
    return `https://maps.google.com/maps?q=${item.latitude},${item.longitude}&z=15&output=embed`;
  }
  return '';
}
