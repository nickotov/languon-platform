import { KeyOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useLogin, useTranslate } from '@refinedev/core';
import { Alert, Button, Card, Divider, Form, Input, Typography } from 'antd';
import { useState } from 'react';

import styles from './login-page.module.css';

interface LoginValues {
    email: string;
    password: string;
}

export function LoginPage() {
    const login = useLogin<LoginValues | { providerName: 'passkey' }>();
    const translate = useTranslate();
    const [error, setError] = useState<string | null>(null);

    const submit = async (
        values: LoginValues | { providerName: 'passkey' },
    ) => {
        setError(null);
        const response = await login.mutateAsync(values);
        if (!response.success) {
            setError(response.error?.message ?? translate('login.failed'));
        }
    };
    return (
        <main className={styles.page}>
            <section className={styles.intro}>
                <span className={styles.eyebrow}>
                    {translate('login.eyebrow')}
                </span>
                <Typography.Title>
                    {translate('login.heading')}
                </Typography.Title>
                <Typography.Paragraph>
                    {translate('login.description')}
                </Typography.Paragraph>
            </section>
            <Card className={styles.card}>
                <Typography.Title level={2}>
                    {translate('pages.login.title')}
                </Typography.Title>
                <Typography.Paragraph type='secondary'>
                    {translate('login.edgeDescription')}
                </Typography.Paragraph>
                {error ? (
                    <Alert
                        closable
                        message={error}
                        onClose={() => setError(null)}
                        showIcon
                        type='error'
                    />
                ) : null}
                <Form<LoginValues>
                    layout='vertical'
                    onFinish={submit}
                    requiredMark='optional'
                >
                    <Form.Item
                        label={translate('login.email')}
                        name='email'
                        rules={[{ required: true, type: 'email' }]}
                    >
                        <Input
                            autoComplete='username'
                            prefix={<MailOutlined />}
                            size='large'
                        />
                    </Form.Item>
                    <Form.Item
                        label={translate('login.password')}
                        name='password'
                        rules={[{ required: true }]}
                    >
                        <Input.Password
                            autoComplete='current-password'
                            prefix={<LockOutlined />}
                            size='large'
                        />
                    </Form.Item>
                    <Button
                        block
                        htmlType='submit'
                        loading={login.isPending}
                        size='large'
                        type='primary'
                    >
                        {translate('login.signIn')}
                    </Button>
                </Form>
                <Divider>{translate('login.separator')}</Divider>
                <Button
                    block
                    icon={<KeyOutlined />}
                    loading={login.isPending}
                    onClick={() => void submit({ providerName: 'passkey' })}
                    size='large'
                >
                    {translate('login.passkey')}
                </Button>
            </Card>
        </main>
    );
}
