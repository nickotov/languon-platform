// This deliberately small, versioned seed list keeps policy deterministic.
// It can be expanded from a reviewed offline corpus without adding a runtime
// dependency on an external breach service.
export const commonPasswordsVersion = "2026-08-13.1";

export const commonPasswords = new Set([
  "123456789012345",
  "letmeinletmeinletmein",
  "passwordpassword",
  "qwertyqwertyqwerty",
]);
