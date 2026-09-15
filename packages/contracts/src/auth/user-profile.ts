import { z } from 'zod';

export const HandleSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/);

export const UpdateHandleRequestSchema = z
    .object({ handle: HandleSchema })
    .strict();

export const UpdateHandleResponseSchema = z
    .object({ handle: HandleSchema })
    .strict();

export type Handle = z.infer<typeof HandleSchema>;
export type UpdateHandleRequest = z.infer<typeof UpdateHandleRequestSchema>;
export type UpdateHandleResponse = z.infer<typeof UpdateHandleResponseSchema>;
