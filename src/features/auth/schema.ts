import { z } from "zod";

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email address or mobile number.")
    .max(255),
  // No length rule here on purpose: rejecting a short password at login would
  // tell an attacker their guess was too short to be this account's password.
  password: z.string().min(1, "Enter your password.").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
