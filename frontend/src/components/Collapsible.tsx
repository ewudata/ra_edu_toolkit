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
    <div className="overflow-hidden rounded-[22px] border-2 border-[#cbeae3] bg-[#f7fcfa] shadow-[0_6px_0_0_#deefe9]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between bg-[#f3fbf8] px-4 py-3 text-left text-sm font-semibold text-[#3d6f67] transition-colors hover:bg-[#edf8f6]"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#4b9b8d] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t-2 border-[#deefe9] px-4 py-3">{children}</div>}
    </div>
  );
}
