import { z } from 'zod';
export const LessonTaskIdSchema = z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/u);
export const LessonPartIdSchema = z
    .string()
    .max(117)
    .refine((value) => {
        const [proposal, task, ...extra] = value.split('/');

        return (
            extra.length === 0 &&
            z.uuid().safeParse(proposal).success &&
            LessonTaskIdSchema.safeParse(task).success
        );
    });
