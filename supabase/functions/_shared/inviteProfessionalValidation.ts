import { isValidEmail, isValidName } from "./validation.ts";

export interface InviteProfessionalInput {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
}

export interface ValidInviteProfessionalInput {
  firstName: string;
  lastName: string;
  email: string;
}

export function validateInviteProfessionalInput(
  input: InviteProfessionalInput,
): { data: ValidInviteProfessionalInput } | { error: string } {
  if (
    typeof input.first_name !== "string" ||
    typeof input.last_name !== "string" ||
    typeof input.email !== "string"
  ) {
    return { error: "Nombre, apellidos y email son obligatorios" };
  }

  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  const email = input.email.trim().toLowerCase();

  if (!isValidName(firstName) || !isValidName(lastName)) {
    return { error: "El nombre y los apellidos deben tener entre 1 y 100 caracteres" };
  }

  if (!isValidEmail(email)) {
    return { error: "Introduce un email válido" };
  }

  return { data: { firstName, lastName, email } };
}
