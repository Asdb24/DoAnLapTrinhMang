import type { BlockedUser, Channel, Contact, Conversation, UserSettings } from "@/types";

export interface ApiState {
  conversations: Conversation[];
  channels: Channel[];
  contacts: Contact[];
  settings: UserSettings;
  blockedUsers: BlockedUser[];
  currentUser: { id: string; email: string };
  migrationCompleted: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/** Same-origin server routes use the Supabase SSR session cookie and enforce user authorization. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const multipart = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: "same-origin", cache: "no-store",
      headers: body !== undefined && !multipart ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Unable to connect. Check your connection and try again.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof data?.error === "string" ? data.error : `Request failed (${response.status}). Please try again.`, response.status);
  if (data === null) throw new ApiError("The server returned an invalid response. Please try again.", response.status);
  return data as T;
}

/** Only use actual web/file URLs, including legacy image data URLs. */
export function mediaUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (/^\/(?!\/)/.test(url) || /^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
  return undefined;
}
