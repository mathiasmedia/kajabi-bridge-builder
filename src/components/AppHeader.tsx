import { FileArchive } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const steps = [
  { path: '/', label: 'New' },
  { path: '/extract', label: 'Extract' },
  { path: '/mapping', label: 'Map & Export' },
  { path: '/templates', label: 'Templates' },
];

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="border-b bg-card">
      <div className="container flex items-center h-14 gap-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <FileArchive className="h-5 w-5 text-primary" />
          <span className="font-display font-bold">Export to Kajabi</span>
        </button>
        <nav className="flex items-center gap-1 ml-auto">
          {steps.map((step, i) => {
            const isActive = location.pathname === step.path;
            const isPast = steps.findIndex(s => s.path === location.pathname) > i;
            return (
              <button
                key={step.path}
                onClick={() => navigate(step.path)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isPast
                    ? 'text-foreground hover:bg-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {step.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
