import SettingsWorkspace from './settings/SettingsWorkspace';

/**
 * Kept as a thin wrapper because this page is mounted twice: at /settings and
 * again inside the OPD workspace at /opd/settings.
 */
export default function Settings() {
  return <SettingsWorkspace />;
}