import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  quiet?: boolean;
  children: ReactNode;
}

export default function Collapsible({ title, defaultOpen = false, quiet = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const shellClass = quiet
    ? 'overflow-hidden rounded-2xl border border-[#dde5e1] bg-white/70'
    : 'overflow-hidden rounded-[22px] border border-[#d6e8e3] bg-white/78 shadow-[0_8px_18px_rgba(24,39,75,0.05)]';
  const buttonClass = quiet
    ? 'flex w-full cursor-pointer items-center justify-between bg-white/70 px-3 py-2.5 text-left text-sm font-semibold text-[#3d6f67] transition-colors hover:bg-[#f8fcfb]'
    : 'flex w-full cursor-pointer items-center justify-between bg-[#f7fcfa] px-4 py-3 text-left text-sm font-semibold text-[#3d6f67] transition-colors hover:bg-[#edf8f6]';
  const panelClass = quiet
    ? 'border-t border-[#e4ece9] px-3 py-3'
    : 'border-t border-[#deefe9] px-4 py-3';

  return (
    <div className={shellClass}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className={buttonClass}
      >
        <span>{title}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 text-[#4b9b8d] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div id={panelId} className={panelClass}>{children}</div>}
    </div>
  );
}
