import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const avatar = z
  .string()
  .max(2_800_000)
  .refine(
    (v) =>
      !v ||
      /^https?:\/\//i.test(v) ||
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Use an HTTP image URL or a PNG/JPEG/WebP/GIF image under 2 MB.",
  );
export const settingsSchema = z
  .object({
    theme: z.enum(["light", "dark"]).optional(),
    density: z.enum(["cozy", "compact"]).optional(),
    enterToSend: z.boolean().optional(),
    desktopNotifications: z.boolean().optional(),
    soundNotifications: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    statusMessage: z.string().max(300).optional(),
    avatar: avatar.optional(),
    presence: z.enum(["online", "away", "offline"]).optional(),
    role: z.string().trim().max(100).optional(),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
export const registerSchema = loginSchema.extend({
  password: z.string().min(10).max(256),
  displayName: z.string().trim().min(1).max(100),
});
export const channelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((s) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, ""),
      )
      .refine(
        (s) => /[a-z0-9]/.test(s),
        "Channel name must contain a letter or digit.",
      ),
    description: z.string().max(1000).default(""),
    category: z.enum(["Engineering", "Design", "Product", "General", "Random"]),
    isPrivate: z.boolean(),
  })
  .strict();
export const attachmentSchema = z
  .object({
    name: z.string().min(1).max(255),
    size: z.string().max(40),
    type: z.enum(["image", "doc", "pdf"]),
    url: z.string().regex(/^\/api\/uploads\/[0-9a-f-]{36}$/),
  })
  .strict();
export const messageSchema = z
  .object({
    content: z.string().max(20000),
    attachments: z.array(attachmentSchema).max(5).optional(),
  })
  .strict()
  .refine(
    (v) => v.content.trim().length > 0 || !!v.attachments?.length,
    "Write a message or attach a file.",
  );
export const emojiSchema = z
  .object({
    emoji: z
      .string()
      .min(1)
      .max(32)
      .refine((s) => !/[\x00-\x1f]/.test(s)),
  })
  .strict();
const legacyMessage = z
  .object({
    id: z.string().max(200),
    senderName: z.string().max(100),
    content: z.string().max(20000),
    isSentByMe: z.boolean(),
    date: z.string().max(80).optional(),
    timestamp: z.string().max(80).optional(),
  })
  .passthrough();
export const migrationSchema = z
  .object({
    conversations: z
      .array(
        z
          .object({
            id: z.string().max(200),
            name: z.string().min(1).max(200),
            type: z.enum(["direct", "group"]),
            description: z.string().max(1000).optional(),
            messages: z.array(legacyMessage).max(5000),
          })
          .passthrough(),
      )
      .max(200)
      .optional(),
    channels: z
      .array(
        z
          .object({
            id: z.string().max(200),
            name: z.string().min(1).max(80),
            description: z.string().max(1000),
            category: z.enum([
              "Engineering",
              "Design",
              "Product",
              "General",
              "Random",
            ]),
            isPrivate: z.boolean(),
            isJoined: z.boolean(),
          })
          .passthrough(),
      )
      .max(200)
      .optional(),
    settings: settingsSchema
      .extend({ email: z.string().max(254).optional() })
      .strip()
      .optional(),
  })
  .strict();
