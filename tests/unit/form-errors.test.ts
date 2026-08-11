import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FORM_LEVEL_KEY,
  fieldElementId,
  fieldErrorsFromZod,
} from "@/lib/form-errors";

const schema = z.object({
  full_name: z.string().min(1, "Full name is required."),
  email: z.email("Enter a valid email address."),
});

function errorFrom(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected the schema to reject this input");
  return result.error;
}

describe("fieldErrorsFromZod", () => {
  it("returns one message per failing field", () => {
    const errors = fieldErrorsFromZod(errorFrom({ full_name: "", email: "nope" }));
    expect(errors).toEqual({
      full_name: "Full name is required.",
      email: "Enter a valid email address.",
    });
  });

  it("keeps the first message when one field fails twice", () => {
    const twice = z.object({
      pin: z.string().min(4, "Too short.").regex(/^\d+$/, "Digits only."),
    });
    const result = twice.safeParse({ pin: "ab" });
    if (result.success) throw new Error("expected rejection");
    expect(fieldErrorsFromZod(result.error).pin).toBe("Too short.");
  });

  it("buckets a path-less issue under the form-level key", () => {
    const formLevel = z
      .object({ a: z.string() })
      .refine(() => false, { message: "The whole form is wrong." });
    const result = formLevel.safeParse({ a: "x" });
    if (result.success) throw new Error("expected rejection");
    expect(fieldErrorsFromZod(result.error)[FORM_LEVEL_KEY]).toBe(
      "The whole form is wrong.",
    );
  });

  it("returns an empty map for an error with no issues", () => {
    expect(fieldErrorsFromZod(new z.ZodError([]))).toEqual({});
  });
});

describe("fieldElementId", () => {
  it("joins the form id and field name", () => {
    expect(fieldElementId("user-form", "email")).toBe("user-form-email");
  });
});
