import { z } from "zod";
import {
  emailSchema,
  fullNameSchema,
  mobileSchema,
  passwordSchema,
  photoUrlSchema,
  requireEmailOrMobile,
  roleIdSchema,
  statusSchema,
} from "@/lib/validation";

export const createUserSchema = z
  .object({
    full_name: fullNameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    password: passwordSchema,
    role_id: roleIdSchema,
    photo_url: photoUrlSchema,
  })
  .superRefine(requireEmailOrMobile);

/**
 * Fields any user with the `users` module may change.
 *
 * `role_id` and `status` are deliberately NOT here — they are privilege
 * controls, handled separately in `privilegedUserFieldsSchema` and gated
 * behind a super-admin check in the route.
 */
export const updateUserSchema = z
  .object({
    full_name: fullNameSchema,
    email: emailSchema,
    mobile: mobileSchema,
    photo_url: photoUrlSchema.optional(),
  })
  .superRefine(requireEmailOrMobile);

/** Fields only a super admin may change. Both can grant or remove access. */
export const privilegedUserFieldsSchema = z.object({
  role_id: roleIdSchema.optional(),
  status: statusSchema.optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
