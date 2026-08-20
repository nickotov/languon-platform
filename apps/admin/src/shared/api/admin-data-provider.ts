import type {
    AdminAuditEventsQuery,
    AdminUsersQuery,
} from '@languon/contracts';
import type { BaseRecord, CrudFilter, DataProvider } from '@refinedev/core';

import { adminApi } from './admin-api';

export const adminDataProvider: DataProvider = {
    getApiUrl: () => adminApi.apiUrl,
    getList: async <TData extends BaseRecord>({
        filters,
        pagination,
        resource,
    }: Parameters<DataProvider['getList']>[0]) => {
        const page = pagination?.currentPage ?? 1;
        const pageSize = pagination?.pageSize ?? 25;
        if (resource === 'users') {
            const response = await adminApi.users({
                page,
                pageSize,
                ...userFilters(filters),
            });
            return {
                data: response.data as unknown as TData[],
                total: response.total,
            };
        }
        if (resource === 'audit-events') {
            const response = await adminApi.auditEvents({
                page,
                pageSize,
                ...auditFilters(filters),
            });
            return {
                data: response.data as unknown as TData[],
                total: response.total,
            };
        }
        throw unsupported(resource);
    },
    getOne: async ({ id, resource }: Parameters<DataProvider['getOne']>[0]) => {
        if (resource !== 'users') throw unsupported(resource);
        const response = await adminApi.user(String(id));
        return { data: response.user as never };
    },
    update: async ({
        id,
        resource,
        variables,
    }: Parameters<DataProvider['update']>[0]) => {
        if (resource !== 'users') throw unsupported(resource);
        const input = variables as {
            expectedVersion?: number;
            operation?: 'disable' | 'restore';
            reason?: string;
        };
        if (
            (input.operation !== 'disable' && input.operation !== 'restore') ||
            typeof input.expectedVersion !== 'number' ||
            typeof input.reason !== 'string'
        ) {
            throw new Error('A valid user status operation is required.');
        }
        const response = await adminApi.mutateUser(
            String(id),
            input.operation,
            {
                expectedVersion: input.expectedVersion,
                reason: input.reason,
            },
        );
        return { data: response.user as never };
    },
    custom: async ({
        url,
    }: Parameters<NonNullable<DataProvider['custom']>>[0]) => {
        if (url !== 'dashboard') throw unsupported(url);
        return { data: (await adminApi.dashboard()) as never };
    },
    create: async ({ resource }) => {
        throw unsupported(resource);
    },
    deleteOne: async ({ resource }) => {
        throw unsupported(resource);
    },
};

function userFilters(
    filters: CrudFilter[] | undefined,
): Partial<Pick<AdminUsersQuery, 'search' | 'status'>> {
    const search = filterValue(filters, 'search');
    const status = filterValue(filters, 'status');
    return {
        ...(typeof search === 'string' && search ? { search } : {}),
        ...(status === 'active' || status === 'disabled' || status === 'pending'
            ? { status }
            : {}),
    };
}

function auditFilters(
    filters: CrudFilter[] | undefined,
): Partial<Pick<AdminAuditEventsQuery, 'action' | 'outcome'>> {
    const action = filterValue(filters, 'action');
    const outcome = filterValue(filters, 'outcome');
    return {
        ...(action === 'membership_granted' ||
        action === 'membership_revoked' ||
        action === 'user_disabled' ||
        action === 'user_restored' ||
        action === 'access_denied' ||
        action === 'audit_pruned'
            ? { action }
            : {}),
        ...(outcome === 'success' || outcome === 'rejected' ? { outcome } : {}),
    };
}

function filterValue(
    filters: CrudFilter[] | undefined,
    field: string,
): unknown {
    const filter = filters?.find(
        (candidate) => 'field' in candidate && candidate.field === field,
    );
    return filter && 'value' in filter ? filter.value : undefined;
}

function unsupported(resource: string): Error {
    return new Error(`The ${resource} operation is not supported.`);
}
