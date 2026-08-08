import { z } from "zod";
import {
  emailSchema,
  fullNameSchema,
  mobileSchema,
  passwordSchema,
  photoUrlSchema,
  requireEmailOrMobile,
} from "@/lib/validation";

export const updateProfileSchema = z
  .object({
    full_name: fullNameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    photo_url: photoUrlSchema.optional(),
    // Both are required together, or neither. Changing your own password
    // always requires proving you know the current one.
    current_password: z.string().optional(),
    new_password: z.string().optional(),
  })
  .superRefine(requireEmailOrMobile)
  .superRefine((value, ctx) => {
    const wantsChange = Boolean(value.new_password || value.current_password);
    if (!wantsChange) return;

    if (!value.current_password) {
      ctx.addIssue({
        code: "custom",
        message: "Enter your current password to set a new one.",
        path: ["current_password"],
      });
    }
    const parsed = passwordSchema.safeParse(value.new_password ?? "");
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: parsed.error.issues[0]?.message ?? "Invalid new password.",
        path: ["new_password"],
      });
    }
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
