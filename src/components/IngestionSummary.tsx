import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, FileText, Image, Code, Layers } from 'lucide-react';
import type { SourceProjectSnapshot, IngestionWarning } from '@/lib/ingestion';

interface IngestionSummaryProps {
  snapshot: SourceProjectSnapshot;
  warnings?: IngestionWarning[];
}

export default function IngestionSummary({ snapshot, warnings = [] }: IngestionSummaryProps) {
  const { metadata, ingestionMode } = snapshot;

  const modeLabel = {
    bundled: 'Bundled Fixture',
    imported: 'Imported Snapshot',
    'cross-project': 'Cross-Project',
  }[ingestionMode];

  const checks = [
    { label: 'Tailwind config', ok: metadata.hasTailwind },
    { label: 'Global CSS', ok: metadata.hasIndexCss },
    { label: 'App file', ok: metadata.hasAppFile },
    { label: 'Components', ok: metadata.hasComponents },
    { label: 'Pages', ok: metadata.hasPages },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" />
          Source Ingestion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Project info */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{snapshot.projectName}</p>
            <p className="text-xs text-muted-foreground">Page: {snapshot.page}</p>
          </div>
          <Badge variant="outline" className="text-[10px]">{modeLabel}</Badge>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{metadata.fileCount} files</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Image className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{metadata.assetCount} assets</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Code className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{metadata.componentCount} components</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{metadata.pageCount} pages</span>
          </div>
        </div>

        {/* Checks */}
        <div className="flex flex-wrap gap-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              {c.ok ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-yellow-500" />
              )}
              <span className={c.ok ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {w.severity === 'error' ? (
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                ) : w.severity === 'warning' ? (
                  <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                )}
                <span className="text-muted-foreground">{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
