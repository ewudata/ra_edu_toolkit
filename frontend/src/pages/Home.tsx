import { Link } from 'react-router-dom';
import {
  Database,
  FunctionSquare,
  ArrowLeftRight,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Database,
    title: 'Database Manager',
    to: '/databases',
    items: ['CSV/ZIP file import', 'SQL script import', 'Database browsing', 'Table structure viewing'],
  },
  {
    icon: FunctionSquare,
    title: 'RA Exercises',
    to: '/ra-exercises',
    items: ['Guided 3-step workflow', 'Pre-defined practice catalog', 'Custom expression workspace', 'Execution trace visualization'],
  },
  {
    icon: ArrowLeftRight,
    title: 'RA ↔ SQL Reference',
    to: '/ra-sql-reference',
    items: ['Side-by-side solution explorer', 'Expected schema and data previews', 'Translation tips and heuristics', 'Database-scoped exercise catalog'],
  },
];

export default function Home() {
  const shell = 'space-y-6 rounded-[28px] bg-[linear-gradient(180deg,rgba(246,245,253,0.72)_0%,rgba(244,246,252,0.84)_52%,rgba(247,250,249,0.9)_100%)] p-4 sm:p-6';
  const hero = 'rounded-[26px] border border-[#dde1f0] bg-[linear-gradient(135deg,#f5f4ff_0%,#eef2ff_52%,#eef7f4_100%)] p-6 text-[#3f4761] shadow-[0_14px_34px_rgba(123,128,173,0.1)]';
  const blockCard = 'rounded-[24px] border border-[#dfe2f0] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_12px_28px_rgba(123,128,173,0.08)]';
  const sectionLabel = 'text-xs font-semibold uppercase tracking-[0.22em] text-[#615a96]';
  const sectionTitle = 'text-xl font-semibold text-[#3f4761]';

  return (
    <div className={shell}>
      <section className={hero}>
        <div className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#615a96]">Academic Practice Studio</p>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-[#3f4761] sm:text-4xl">Relational Algebra Education Toolkit</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b7a] sm:text-base">
              Study relational algebra through guided exercises, schema exploration, and side-by-side translation references.
            </p>
          </div>
        </div>
      </section>

      <section className={blockCard}>
        <p className={sectionLabel}>Feature Overview</p>
        <h2 className={`mt-1 ${sectionTitle}`}>Choose Your Workspace</h2>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.title}
                to={feature.to}
                className="group rounded-[22px] border border-[#e4e7f2] bg-[rgba(255,255,255,0.9)] p-6 shadow-[0_8px_22px_rgba(123,128,173,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d6daf0]"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="app-icon-tile flex h-12 w-12 items-center justify-center rounded-[18px]">
                    <Icon className="app-icon-glyph h-[18px] w-[18px]" />
                  </div>
                </div>
                <p className={sectionLabel}>Workspace</p>
                <h3 className="mt-1 font-display text-2xl text-[#3f4761] group-hover:text-[#5d6491]">{feature.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#5f6b7a]">
                  {feature.items[0]}. {feature.items[1]}. {feature.items[2]}.
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
