export type GifMedia = { kind: 'gif'; provider: 'giphy'; id: string; title: string; previewUrl: string; mediaUrl: string; width: number; height: number };
export type StickerMedia = { kind: 'sticker'; id: string };
export type ChatMedia = GifMedia | StickerMedia;
export type MediaKind = 'emoji' | 'gif' | 'sticker';
export type MediaUsage = { user_id: string; media_type: MediaKind; media_id: string; use_count: number; last_used_at: string; metadata: unknown };
