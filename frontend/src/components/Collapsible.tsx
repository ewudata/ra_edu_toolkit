import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Collapsible({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-[22px] border-2 border-[#e1c8aa] bg-[#fffaf1] shadow-[0_6px_0_0_#f3e3c9]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full cursor-pointer text-left text-sm font-semibold text-[#6d4b31] transition-colors hover:bg-[#fff3dc] flex items-center justify-between px-4 py-3 bg-[#fff8eb]"
      >
        <span>{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#b98d67] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t-2 border-[#efddc2] px-4 py-3">{children}</div>}
    </div>
  );
}
