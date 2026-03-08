interface Props {
  variant: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

const styles: Record<string, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

export default function StatusBadge({ variant, children }: Props) {
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-sm ${styles[variant]}`}>
      {children}
    </div>
  );
}
