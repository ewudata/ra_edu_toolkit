import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

interface Props {
  variant: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const config: Record<string, { bg: string; icon: typeof Info }> = {
  success: { bg: 'bg-[#e7f7ef] border-[#8cb99d] text-[#335e46]', icon: CheckCircle2 },
  error: { bg: 'bg-[#fde7df] border-[#d9a08f] text-[#86483d]', icon: XCircle },
  warning: { bg: 'bg-[#fff3d7] border-[#e2bc73] text-[#875b23]', icon: AlertTriangle },
  info: { bg: 'bg-[#fff5e7] border-[#e4c49a] text-[#7c5433]', icon: Info },
};

export default function StatusBadge({ variant, children }: Props) {
  const { bg, icon: Icon } = config[variant];
  return (
    <div className={`flex items-start gap-2.5 rounded-[22px] border-2 px-4 py-3 text-sm shadow-[0_4px_0_0_#f1ddbf] ${bg}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
