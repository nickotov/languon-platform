import { contentApi } from './api/content';
import { jobsApi } from './api/jobs';
import { sharingApi } from './api/sharing';
export const textsApi = { ...contentApi, ...jobsApi, ...sharingApi };
export type TextsApi = typeof textsApi;
export { TextsApiError, type RequestWithTextSession } from './api/transport';

export { TextStatusBadge } from './ui/text-status-badge/text-status-badge';
