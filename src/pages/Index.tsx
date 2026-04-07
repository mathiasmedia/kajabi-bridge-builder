import { useEffect } from 'react';
import { useExportStore } from '@/store/useExportStore';
import NewExportPage from './NewExportPage';

export default function Index() {
  const { setWorkspaceProjects } = useExportStore();

  useEffect(() => {
    // Projects will be populated by the cross-project tools at runtime
    // For now, set up a demo list that can be replaced
    // The actual integration happens when the user interacts with the app
  }, [setWorkspaceProjects]);

  return <NewExportPage />;
}
