/** Typed context variables set by the auth middleware and available in all route handlers. */
export type AppVariables = {
  userId: string;
  userName: string;
};
