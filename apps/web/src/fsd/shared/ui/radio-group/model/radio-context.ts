'use client';

import { createContext } from 'react';
import type { Context } from '../types';

export const RadioContext = createContext<Context | null>(null);
