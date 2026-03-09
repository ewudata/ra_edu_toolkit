interface Props {
  database?: string;
}

function Example({ database }: { database?: string }) {
  const db = (database ?? '').toLowerCase();
  if (db === 'testdb') {
    return (
      <div className="space-y-1 text-sm font-mono">
        <p className="text-slate-600">-- Names of CS majors</p>
        <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{name}'}</span>(<span className="text-[var(--color-op)]">σ</span><span className="text-[var(--color-cond)]">{"{major = 'CS'}"}</span>(<span className="text-[var(--color-rel)]">students</span>))</p>
        <p className="text-slate-600 mt-2">-- Students enrolled in C101 with grades</p>
        <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{name, grade}'}</span>(<span className="text-[var(--color-rel)]">students</span> ⋈ <span className="text-[var(--color-rel)]">enroll</span> ⋈ <span className="text-[var(--color-op)]">σ</span><span className="text-[var(--color-cond)]">{"{cid = 'C101'}"}</span>(<span className="text-[var(--color-rel)]">courses</span>))</p>
      </div>
    );
  }
  if (db === 'sales') {
    return (
      <div className="space-y-1 text-sm font-mono">
        <p className="text-slate-600">-- Customers and their reps</p>
        <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{COMPANY, NAME}'}</span>(<span className="text-[var(--color-rel)]">customers</span> ⋈ <span className="text-[var(--color-op)]">ρ</span>{'{EMPL_NUM->CUST_REP}'}(<span className="text-[var(--color-rel)]">salesreps</span>))</p>
        <p className="text-slate-600 mt-2">-- Orders with product descriptions</p>
        <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{ORDER_NUM, DESCRIPTION}'}</span>(<span className="text-[var(--color-rel)]">orders</span> ⋈ <span className="text-[var(--color-op)]">ρ</span>{'{MFR_ID->MFR, PRODUCT_ID->PRODUCT}'}(<span className="text-[var(--color-rel)]">products</span>))</p>
      </div>
    );
  }
  return (
    <div className="space-y-1 text-sm font-mono">
      <p className="text-slate-600">-- Select names of computer science students</p>
      <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{name}'}</span>(<span className="text-[var(--color-op)]">σ</span><span className="text-[var(--color-cond)]">{"{dept_name = 'Comp. Sci.'}"}</span>(<span className="text-[var(--color-rel)]">Student</span>))</p>
      <p className="text-slate-600 mt-2">-- Find students enrolled in specific courses</p>
      <p><span className="text-[var(--color-op)]">π</span><span className="text-[var(--color-attr)]">{'{name}'}</span>(<span className="text-[var(--color-rel)]">Student</span> ⋈ <span className="text-[var(--color-rel)]">Takes</span> ⋈ <span className="text-[var(--color-op)]">σ</span><span className="text-[var(--color-cond)]">{"{course_id = 'CS-101'}"}</span>(<span className="text-[var(--color-rel)]">Course</span>))</p>
    </div>
  );
}

export default function SyntaxHelp({ database }: Props) {
  const ops = [
    { symbol: 'π', name: 'Projection', usage: 'π{attr1,attr2}(R)', aliases: 'pi, PI' },
    { symbol: 'σ', name: 'Selection', usage: 'σ{condition}(R)', aliases: 'sigma, SIGMA' },
    { symbol: 'ρ', name: 'Rename', usage: 'ρ alias(R) or ρ{old->new}(R)', aliases: 'rho' },
    { symbol: '⋈', name: 'Natural Join', usage: 'R ⋈ S', aliases: 'join, JOIN' },
    { symbol: '×', name: 'Cartesian Product', usage: 'R × S', aliases: 'x, X, cross, CROSS' },
    { symbol: '∪', name: 'Union', usage: 'R ∪ S', aliases: 'union, UNION' },
    { symbol: '−', name: 'Difference', usage: 'R − S', aliases: '-, diff, DIFF' },
    { symbol: '∩', name: 'Intersection', usage: 'R ∩ S', aliases: 'intersect, INTERSECT' },
    { symbol: '÷', name: 'Division', usage: 'R ÷ S', aliases: '/, div, DIV' },
  ];

  return (
    <div className="space-y-4">
      <h4 className="font-display text-lg font-semibold text-[#5c3b1f]">Relational Algebra Operators</h4>
      <ul className="space-y-1.5 text-sm">
        {ops.map((op) => (
          <li key={op.symbol}>
            <span className="font-bold text-[var(--color-op)]">{op.symbol}</span>{' '}
            <span className="font-semibold text-[#5c3b1f]">{op.name}</span>:{' '}
            <code className="rounded-lg border border-[#ead7b8] bg-[#fff7eb] px-1.5 py-0.5 text-xs font-mono">{op.usage}</code>{' '}
            <span className="text-xs text-[#7c5433]">- aliases: {op.aliases}</span>
          </li>
        ))}
      </ul>
      <h4 className="font-display text-lg font-semibold text-[#5c3b1f]">Example Queries</h4>
      <Example database={database} />
    </div>
  );
}
