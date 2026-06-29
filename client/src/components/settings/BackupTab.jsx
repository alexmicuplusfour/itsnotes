import React from 'react';
import BackupRestore, { ResetSection } from '../BackupRestore';
import ImportExportSettings from '../ImportExportSettings';

const BackupTab = ({ isDarkTheme }) => (
  <>
    <BackupRestore isDarkTheme={isDarkTheme} />
    <div style={{ height: '32px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}></div>
    <ImportExportSettings />
    <ResetSection isDarkTheme={isDarkTheme} />
  </>
);

export default BackupTab;
