import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import './shared/styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AdminApp } from './app/admin-app';

const root = document.querySelector('#root');
if (!root) throw new Error('Admin root element is missing.');

createRoot(root).render(
    <StrictMode>
        <AdminApp />
    </StrictMode>,
);
