import { App as AntdApp, Spin } from 'antd';
import { Authenticated, Refine, useTranslate } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import routerProvider from '@refinedev/react-router';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import { adminAccessProvider } from '@/shared/access/admin-access-provider';
import { adminDataProvider } from '@/shared/api/admin-data-provider';
import { adminAuthProvider } from '@/shared/auth/admin-auth-provider';
import { adminI18nProvider } from '@/shared/i18n/admin-i18n-provider';
import { AdminThemeProvider } from '@/shared/theme/admin-theme-provider';
import { AdminLayout } from '@/widgets/admin-layout/admin-layout';

const AuditPage = lazy(() =>
    import('@/pages/audit/audit-page').then((module) => ({
        default: module.AuditPage,
    })),
);
const DashboardPage = lazy(() =>
    import('@/pages/dashboard/dashboard-page').then((module) => ({
        default: module.DashboardPage,
    })),
);
const LoginPage = lazy(() =>
    import('@/pages/login/login-page').then((module) => ({
        default: module.LoginPage,
    })),
);
const UserDetailPage = lazy(() =>
    import('@/pages/users/user-detail-page').then((module) => ({
        default: module.UserDetailPage,
    })),
);
const UsersPage = lazy(() =>
    import('@/pages/users/users-page').then((module) => ({
        default: module.UsersPage,
    })),
);

export function AdminApp() {
    return (
        <BrowserRouter>
            <AdminThemeProvider>
                <AntdApp>
                    <RefineApplication />
                </AntdApp>
            </AdminThemeProvider>
        </BrowserRouter>
    );
}

function RefineApplication() {
    const notificationProvider = useNotificationProvider();
    return (
        <Refine
            accessControlProvider={adminAccessProvider}
            authProvider={adminAuthProvider}
            dataProvider={adminDataProvider}
            i18nProvider={adminI18nProvider}
            notificationProvider={notificationProvider}
            resources={[
                { name: 'dashboard', list: '/' },
                { name: 'users', list: '/users', show: '/users/:id' },
                { name: 'audit-events', list: '/audit' },
            ]}
            routerProvider={routerProvider}
            options={{
                disableTelemetry: true,
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
            }}
        >
            <Suspense fallback={<PageLoading />}>
                <Routes>
                    <Route
                        element={
                            <Authenticated
                                key='authenticated-admin'
                                fallback={<Navigate replace to='/login' />}
                            >
                                <AdminLayout>
                                    <Outlet />
                                </AdminLayout>
                            </Authenticated>
                        }
                    >
                        <Route index element={<DashboardPage />} />
                        <Route path='users' element={<UsersPage />} />
                        <Route path='users/:id' element={<UserDetailPage />} />
                        <Route path='audit' element={<AuditPage />} />
                    </Route>
                    <Route path='/login' element={<LoginPage />} />
                    <Route path='*' element={<Navigate replace to='/' />} />
                </Routes>
            </Suspense>
        </Refine>
    );
}

function PageLoading() {
    const translate = useTranslate();
    return (
        <div
            aria-label={translate('loading.page')}
            aria-live='polite'
            style={{
                display: 'grid',
                minHeight: '100vh',
                placeItems: 'center',
            }}
        >
            <Spin size='large' />
        </div>
    );
}
