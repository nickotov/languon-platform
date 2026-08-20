import {
    AuditOutlined,
    DashboardOutlined,
    LogoutOutlined,
    MenuOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { useGetIdentity, useLogout, useTranslate } from '@refinedev/core';
import {
    Button,
    Drawer,
    Layout,
    Menu,
    Segmented,
    Space,
    Typography,
} from 'antd';
import type { AdminActor } from '@languon/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import {
    useAdminTheme,
    type ThemePreference,
} from '@/shared/theme/admin-theme-provider';
import styles from './admin-layout.module.css';

export function AdminLayout({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const identity = useGetIdentity<AdminActor>();
    const logout = useLogout();
    const translate = useTranslate();
    const theme = useAdminTheme();
    const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
    const selected = useMemo(
        () =>
            location.pathname.startsWith('/users')
                ? '/users'
                : location.pathname.startsWith('/audit')
                  ? '/audit'
                  : '/',
        [location.pathname],
    );
    const navigationItems = [
        {
            icon: <DashboardOutlined />,
            key: '/',
            label: translate('shell.overview'),
        },
        {
            icon: <TeamOutlined />,
            key: '/users',
            label: translate('shell.users'),
        },
        {
            icon: <AuditOutlined />,
            key: '/audit',
            label: translate('shell.audit'),
        },
    ];
    const navigation = (closeAfterNavigate = false) => (
        <>
            <Link
                aria-label={translate('shell.brandLabel')}
                className={styles.brand}
                onClick={() => {
                    if (closeAfterNavigate) setMobileNavigationOpen(false);
                }}
                to='/'
            >
                <span aria-hidden='true' className={styles.brandMark}>
                    L
                </span>
                <span>
                    <strong>{translate('shell.brand')}</strong>
                    <small>{translate('shell.administration')}</small>
                </span>
            </Link>
            <Menu
                items={navigationItems}
                mode='inline'
                onClick={({ key }) => {
                    navigate(key);
                    if (closeAfterNavigate) setMobileNavigationOpen(false);
                }}
                selectedKeys={[selected]}
            />
            <div className={styles.release}>
                {translate('shell.release', {
                    sha: __RELEASE_SHA__.slice(0, 12),
                })}
            </div>
        </>
    );
    return (
        <Layout className={styles.shell}>
            <Layout.Sider className={styles.desktopSider} width={248}>
                {navigation()}
            </Layout.Sider>
            <Drawer
                className={styles.mobileDrawer}
                onClose={() => setMobileNavigationOpen(false)}
                open={mobileNavigationOpen}
                placement='left'
                styles={{ body: { padding: '16px 0' } }}
                title={translate('shell.navigation')}
                width={248}
            >
                {navigation(true)}
            </Drawer>
            <Layout>
                <Layout.Header className={styles.header}>
                    <div className={styles.identity}>
                        <Button
                            aria-label={translate('shell.openNavigation')}
                            className={styles.mobileMenu}
                            icon={<MenuOutlined />}
                            onClick={() => setMobileNavigationOpen(true)}
                            type='text'
                        />
                        <div>
                            <Typography.Text strong>
                                {identity.data?.primaryEmail ??
                                    translate('access.owner')}
                            </Typography.Text>
                            <Typography.Text className={styles.role}>
                                {translate('access.owner')}
                            </Typography.Text>
                        </div>
                    </div>
                    <Space wrap>
                        <Segmented<ThemePreference>
                            aria-label={translate('theme.label')}
                            onChange={theme.setPreference}
                            options={[
                                {
                                    label: translate('theme.light'),
                                    value: 'light',
                                },
                                {
                                    label: translate('theme.dark'),
                                    value: 'dark',
                                },
                                {
                                    label: translate('theme.system'),
                                    value: 'system',
                                },
                            ]}
                            size='small'
                            value={theme.preference}
                        />
                        <Button
                            icon={<LogoutOutlined />}
                            loading={logout.isPending}
                            onClick={() => logout.mutate()}
                            type='text'
                        >
                            {translate('buttons.logout')}
                        </Button>
                    </Space>
                </Layout.Header>
                <Layout.Content className={styles.content}>
                    {children}
                </Layout.Content>
            </Layout>
        </Layout>
    );
}
