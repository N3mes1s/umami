import type { Metadata } from 'next';
import { ApiKeysSettingsPage } from './ApiKeysSettingsPage';

export default function () {
  return <ApiKeysSettingsPage />;
}

export const metadata: Metadata = {
  title: 'API keys',
};
