import { useEffect } from 'react';
import { useExportStore } from '@/store/useExportStore';
import NewExportPage from './NewExportPage';

// Workspace projects available for cross-project referencing
const WORKSPACE_PROJECTS = [
  { id: 'eb365d77-280e-413a-ac01-0dbd5bf741fc', name: 'Woven Waves Landing' },
  { id: '007b195f-590f-419c-94b8-6f744262c24a', name: 'M&A Council Foundation' },
  { id: 'b4a7dfca-e15b-4a69-a46a-506d63288c27', name: 'mathias-media-main' },
  { id: '9bc64fee-e88a-43ff-8897-16094032bd53', name: 'teacher-planner-perfected' },
  { id: '6a1e15dd-ae5a-42fd-b4ce-15fd086298c7', name: 'Launch Compass' },
  { id: 'ab639ebf-cc67-4210-b8ae-0965ba9da41f', name: 'widget-wonderland-snippets' },
  { id: 'aca99257-b267-4b32-b718-4ceb1c382b9a', name: 'mathias-ai-chat-buddy' },
];

export default function Index() {
  const { setWorkspaceProjects } = useExportStore();

  useEffect(() => {
    setWorkspaceProjects(WORKSPACE_PROJECTS);
  }, [setWorkspaceProjects]);

  return <NewExportPage />;
}
