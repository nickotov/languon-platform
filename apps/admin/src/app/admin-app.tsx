import { App as AntdApp, Spin } from 'antd';
import { Authenticated, Refine, useTranslate } from '@refinedev/core';
import { useNotificationProvider } from '@refinedev/antd';
import routerProvider from '@refinedev/react-router';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';

import { adminMcpEnabled } from '@/shared/config/admin-capabilities';
import { adminAccessProvider } from '@/shared/access/admin-access-provider';
import { adminDataProvider } from '@/shared/api/admin-data-provider';
import { adminAuthProvider } from '@/shared/auth/admin-auth-provider';
import { adminI18nProvider } from '@/shared/i18n/admin-i18n-provider';
import { AdminThemeProvider } from '@/shared/theme/admin-theme-provider';
import { AdminLayout } from '@/widgets/admin-layout/admin-layout';

const AdminMcpPage = adminMcpEnabled
    ? lazy(() =>
          import('@/pages/admin-mcp').then((module) => ({
              default: module.AdminMcpPage,
          })),
      )
    : null;

const AccountingPage = lazy(() =>
    import('@/pages/accounting').then((module) => ({
        default: module.AccountingPage,
    })),
);
const AuditPage = lazy(() =>
    import('@/pages/audit/audit-page').then((module) => ({
        default: module.AuditPage,
    })),
);
const AiSettingsPage = lazy(() =>
    import('@/pages/ai-settings/ai-settings-page').then((module) => ({
        default: module.AiSettingsPage,
    })),
);
const SpeechRecordingsPage = lazy(() =>
    import('@/pages/speech-recordings/speech-recordings-page').then(
        (module) => ({ default: module.SpeechRecordingsPage }),
    ),
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
    const resources = [
        { name: 'dashboard', list: '/' },
        { name: 'users', list: '/users', show: '/users/:id' },
        { name: 'audit-events', list: '/audit' },
        { name: 'ai-settings', list: '/ai-settings' },
        { name: 'accounting', list: '/accounting' },
        { name: 'speech-recordings', list: '/speech-recordings' },
    ];
    if (adminMcpEnabled)
        resources.push({ name: 'admin-mcp', list: '/admin-mcp' });
    return (
        <Refine
            accessControlProvider={adminAccessProvider}
            authProvider={adminAuthProvider}
            dataProvider={adminDataProvider}
            i18nProvider={adminI18nProvider}
            notificationProvider={notificationProvider}
            resources={resources}
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
                        {AdminMcpPage ? (
                            <Route
                                path='admin-mcp'
                                element={<AdminMcpPage />}
                            />
                        ) : null}
                        <Route path='accounting' element={<AccountingPage />} />
                        <Route
                            path='speech-recordings'
                            element={<SpeechRecordingsPage />}
                        />
                        <Route
                            path='ai-settings'
                            element={<AiSettingsPage />}
                        />
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
