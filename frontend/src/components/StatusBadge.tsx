import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

interface Props {
  variant: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const config: Record<string, { bg: string; icon: typeof Info }> = {
  success: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: CheckCircle2 },
  error: { bg: 'bg-red-50 border-red-200 text-red-700', icon: XCircle },
  warning: { bg: 'bg-amber-50 border-amber-200 text-amber-800', icon: AlertTriangle },
  info: { bg: 'bg-sky-50 border-sky-200 text-sky-700', icon: Info },
};

export default function StatusBadge({ variant, children }: Props) {
  const { bg, icon: Icon } = config[variant];
  return (
    <div className={`flex items-start gap-2.5 border rounded-lg px-4 py-2.5 text-sm ${bg}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
