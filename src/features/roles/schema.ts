import { z } from "zod";
import { moduleKeysSchema } from "@/lib/validation";

export const roleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name is required.")
    .max(80, "Group name must be 80 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(240, "Description must be 240 characters or fewer.")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  modules: moduleKeysSchema,
});

export type RoleInput = z.infer<typeof roleInputSchema>;
