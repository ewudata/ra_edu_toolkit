type RaNode =
  | { type: 'relation'; name: string }
  | { type: 'projection'; attrs: string[]; sub: RaNode }
  | { type: 'selection'; cond: string; sub: RaNode }
  | { type: 'rename'; relationAlias: string | null; pairs: Array<[string, string]>; sub: RaNode }
  | { type: 'join'; left: RaNode; right: RaNode; theta: string | null }
  | { type: 'product'; left: RaNode; right: RaNode }
  | { type: 'union'; left: RaNode; right: RaNode }
  | { type: 'difference'; left: RaNode; right: RaNode }
  | { type: 'intersection'; left: RaNode; right: RaNode }
  | { type: 'division'; left: RaNode; right: RaNode };

export class TranslationError extends Error {}

export type TranslationOutcome = {
  translated: string;
  warning?: string;
};

export type TranslationSchema = Record<string, string[]>;

function isIdentifierStart(char: string | undefined): boolean {
  return !!char && /[A-Za-z_]/.test(char);
}

function isIdentifierChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_.]/.test(char);
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

class RaParser {
  private pos = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  parse(): RaNode {
    const expr = this.parseExpr();
    this.skipWhitespace();
    if (!this.isAtEnd()) {
      throw new TranslationError(`Unexpected token near "${this.text.slice(this.pos, this.pos + 20)}".`);
    }
    return expr;
  }

  private parseExpr(): RaNode {
    let node = this.parseTerm();

    while (true) {
      this.skipWhitespace();

      if (this.matchJoin()) {
        this.skipWhitespace();
        let theta: string | null = null;
        if (this.peek() === '{') {
          theta = this.readBalanced('{', '}').trim() || null;
        }
        const right = this.parseTerm();
        node = { type: 'join', left: node, right, theta };
        continue;
      }

      if (this.matchSymbol('×') || this.matchKeyword('cross') || this.matchProductX()) {
        const right = this.parseTerm();
        node = { type: 'product', left: node, right };
        continue;
      }

      if (this.matchSymbol('∪') || this.matchKeyword('union')) {
        const right = this.parseTerm();
        node = { type: 'union', left: node, right };
        continue;
      }

      if (this.matchDiff()) {
        const right = this.parseTerm();
        node = { type: 'difference', left: node, right };
        continue;
      }

      if (this.matchSymbol('∩') || this.matchKeyword('intersect')) {
        const right = this.parseTerm();
        node = { type: 'intersection', left: node, right };
        continue;
      }

      if (this.matchSymbol('÷') || this.matchDivisionSlash() || this.matchKeyword('div')) {
        const right = this.parseTerm();
        node = { type: 'division', left: node, right };
        continue;
      }

      break;
    }

    return node;
  }

  private parseTerm(): RaNode {
    this.skipWhitespace();

    if (this.matchSymbol('π') || this.matchKeyword('pi')) {
      this.skipWhitespace();
      const attrs = this.readBalanced('{', '}')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const sub = this.readParenExpr();
      return { type: 'projection', attrs, sub };
    }

    if (this.matchSymbol('σ') || this.matchKeyword('sigma')) {
      this.skipWhitespace();
      const cond = this.readBalanced('{', '}').trim();
      const sub = this.readParenExpr();
      return { type: 'selection', cond, sub };
    }

    if (this.matchSymbol('ρ') || this.matchKeyword('rho')) {
      this.skipWhitespace();
      let relationAlias: string | null = null;
      let pairs: Array<[string, string]> = [];

      if (isIdentifierStart(this.peek())) {
        relationAlias = this.readIdentifier();
        this.skipWhitespace();
      }

      if (this.peek() === '{') {
        pairs = this.readBalanced('{', '}')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((pair) => {
            const [from, to] = pair.split('->').map((part) => part.trim());
            if (!from || !to) {
              throw new TranslationError(`Invalid rename pair "${pair}".`);
            }
            return [from, to] as [string, string];
          });
      }

      if (!relationAlias && pairs.length === 0) {
        throw new TranslationError('Rename requires a relation alias or at least one attribute mapping.');
      }

      const sub = this.readParenExpr();
      return { type: 'rename', relationAlias, pairs, sub };
    }

    if (this.peek() === '(') {
      this.pos += 1;
      const expr = this.parseExpr();
      this.skipWhitespace();
      this.expect(')');
      return expr;
    }

    if (!isIdentifierStart(this.peek())) {
      throw new TranslationError(`Expected a relation or operator near "${this.text.slice(this.pos, this.pos + 20)}".`);
    }

    return { type: 'relation', name: this.readIdentifier() };
  }

  private readParenExpr(): RaNode {
    this.skipWhitespace();
    this.expect('(');
    const expr = this.parseExpr();
    this.skipWhitespace();
    this.expect(')');
    return expr;
  }

  private readBalanced(open: string, close: string): string {
    this.skipWhitespace();
    this.expect(open);
    const start = this.pos;
    let depth = 1;

    while (!this.isAtEnd()) {
      const char = this.text[this.pos];
      if (char === open) depth += 1;
      if (char === close) {
        depth -= 1;
        if (depth === 0) {
          const value = this.text.slice(start, this.pos);
          this.pos += 1;
          return value;
        }
      }
      this.pos += 1;
    }

    throw new TranslationError(`Missing closing "${close}".`);
  }

  private readIdentifier(): string {
    if (!isIdentifierStart(this.peek())) {
      throw new TranslationError(`Expected identifier near "${this.text.slice(this.pos, this.pos + 20)}".`);
    }

    const start = this.pos;
    this.pos += 1;
    while (isIdentifierChar(this.peek())) this.pos += 1;
    return this.text.slice(start, this.pos);
  }

  private matchJoin(): boolean {
    return (
      this.matchSymbol('⋈')
      || this.matchKeyword('natural_join')
      || this.matchKeyword('natjoin')
      || this.matchKeyword('njoin')
    );
  }

  private matchDiff(): boolean {
    return this.matchSymbol('−') || this.matchKeyword('diff') || this.matchStandalone('-');
  }

  private matchDivisionSlash(): boolean {
    return this.matchStandalone('/');
  }

  private matchProductX(): boolean {
    const char = this.peek();
    if (char !== 'x' && char !== 'X') return false;

    const prev = this.text[this.pos - 1];
    const next = this.text[this.pos + 1];
    if (isIdentifierChar(prev) || isIdentifierChar(next)) return false;
    this.pos += 1;
    return true;
  }

  private matchStandalone(symbol: string): boolean {
    this.skipWhitespace();
    if (this.text[this.pos] !== symbol) return false;

    const prev = this.text[this.pos - 1];
    const next = this.text[this.pos + 1];
    if (isIdentifierChar(prev) || isIdentifierChar(next)) return false;
    this.pos += 1;
    return true;
  }

  private matchSymbol(symbol: string): boolean {
    this.skipWhitespace();
    if (this.text.startsWith(symbol, this.pos)) {
      this.pos += symbol.length;
      return true;
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    this.skipWhitespace();
    const candidate = this.text.slice(this.pos, this.pos + keyword.length);
    if (candidate.toLowerCase() !== keyword.toLowerCase()) return false;

    const prev = this.text[this.pos - 1];
    const next = this.text[this.pos + keyword.length];
    if (isIdentifierChar(prev) || isIdentifierChar(next)) return false;
    this.pos += keyword.length;
    return true;
  }

  private skipWhitespace() {
    while (!this.isAtEnd() && /\s/.test(this.text[this.pos]!)) this.pos += 1;
  }

  private expect(char: string) {
    if (this.text[this.pos] !== char) {
      throw new TranslationError(`Expected "${char}" near "${this.text.slice(this.pos, this.pos + 20)}".`);
    }
    this.pos += 1;
  }

  private peek(): string | undefined {
    return this.text[this.pos];
  }

  private isAtEnd(): boolean {
    return this.pos >= this.text.length;
  }
}

function renderRa(node: RaNode): string {
  switch (node.type) {
    case 'relation':
      return node.name;
    case 'projection':
      return `π{${node.attrs.join(', ')}}(${renderRa(node.sub)})`;
    case 'selection':
      return `σ{${node.cond}}(${renderRa(node.sub)})`;
    case 'rename': {
      const pairs = node.pairs.length
        ? `{${node.pairs.map(([from, to]) => `${from}->${to}`).join(', ')}}`
        : '';

      if (node.relationAlias && node.pairs.length) {
        return `ρ${pairs}(ρ${node.relationAlias}(${renderRa(node.sub)}))`;
      }
      if (node.relationAlias) {
        return `ρ${node.relationAlias}(${renderRa(node.sub)})`;
      }
      return `ρ${pairs}(${renderRa(node.sub)})`;
    }
    case 'join':
      return `${wrapRaBinary(node.left)} ${node.theta ? `⋈{${node.theta}}` : '⋈'} ${wrapRaBinary(node.right)}`;
    case 'product':
      return `${wrapRaBinary(node.left)} × ${wrapRaBinary(node.right)}`;
    case 'union':
      return `${wrapRaBinary(node.left)} ∪ ${wrapRaBinary(node.right)}`;
    case 'difference':
      return `${wrapRaBinary(node.left)} − ${wrapRaBinary(node.right)}`;
    case 'intersection':
      return `${wrapRaBinary(node.left)} ∩ ${wrapRaBinary(node.right)}`;
    case 'division':
      return `${wrapRaBinary(node.left)} ÷ ${wrapRaBinary(node.right)}`;
  }
}

function wrapRaBinary(node: RaNode): string {
  if (node.type === 'relation' || node.type === 'projection' || node.type === 'selection' || node.type === 'rename') {
    return renderRa(node);
  }
  return `(${renderRa(node)})`;
}

function indentSql(sql: string): string {
  return sql
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

type SchemaContext = {
  columns: string[];
  aliases: Record<string, string[]>;
};

function combineAliases(
  outputCols: string[],
  leftAliases: Record<string, string[]>,
  rightAliases?: Record<string, string[]>,
): Record<string, string[]> {
  const outSet = new Set(outputCols);
  const aliases: Record<string, string[]> = {};

  function mapAndStore(source: Record<string, string[]>, preferSuffix = false) {
    for (const [alias, cols] of Object.entries(source)) {
      const mapped: string[] = [];
      for (const col of cols) {
        if (preferSuffix && outSet.has(`${col}_r`)) mapped.push(`${col}_r`);
        else if (outSet.has(col)) mapped.push(col);
        else if (outSet.has(`${col}_r`)) mapped.push(`${col}_r`);
      }
      if (mapped.length) aliases[alias] = mapped;
    }
  }

  mapAndStore(leftAliases);
  if (rightAliases) mapAndStore(rightAliases, true);
  return aliases;
}

function resolveRenameSource(source: string, columns: string[], aliases: Record<string, string[]>): string | null {
  if (columns.includes(source)) return source;
  if (!source.includes('.')) return null;

  const [alias, qualifiedName] = source.split('.', 2);
  if (!alias || !qualifiedName) return null;
  const aliasCols = aliases[alias] ?? [];
  const match = aliasCols.find((col) => col === qualifiedName || (col.endsWith('_r') && col.slice(0, -2) === qualifiedName));
  return match ?? null;
}

function resolveRenamePairs(
  columns: string[],
  pairs: Array<[string, string]>,
  aliases: Record<string, string[]>,
): Array<[string, string]> {
  return pairs.map(([from, to]) => {
    const resolved = resolveRenameSource(from, columns, aliases);
    if (!resolved) {
      throw new TranslationError(`Cannot rename missing attribute "${from}".`);
    }
    return [resolved, to];
  });
}

function mapRenamedSchema(
  columns: string[],
  pairs: Array<[string, string]>,
  aliases: Record<string, string[]> = {},
): string[] {
  const sourceSet = new Set(columns);
  const renameMap = new Map<string, string>();
  const resolvedPairs = resolveRenamePairs(columns, pairs, aliases);

  for (const [from, to] of resolvedPairs) {
    if (!sourceSet.has(from)) {
      throw new TranslationError(`Cannot rename missing attribute "${from}".`);
    }
    if (sourceSet.has(to) && to !== from && !renameMap.has(to)) {
      throw new TranslationError(`Rename target "${to}" already exists.`);
    }
    renameMap.set(from, to);
  }

  const renamed = columns.map((column) => renameMap.get(column) ?? column);
  if (new Set(renamed).size !== renamed.length) {
    throw new TranslationError('Attribute renaming creates duplicate output columns.');
  }
  return renamed;
}

function inferNodeContext(node: RaNode, schema: TranslationSchema): SchemaContext {
  switch (node.type) {
    case 'relation': {
      const columns = schema[node.name];
      if (!columns) {
        throw new TranslationError(`Schema information is required to rename attributes from relation "${node.name}".`);
      }
      return { columns: [...columns], aliases: { [node.name]: [...columns] } };
    }
    case 'projection':
      return { columns: [...node.attrs], aliases: {} };
    case 'selection':
      return inferNodeContext(node.sub, schema);
    case 'rename': {
      const child = inferNodeContext(node.sub, schema);
      const columns = mapRenamedSchema(child.columns, node.pairs, child.aliases);
      let aliases = child.aliases;
      if (node.pairs.length) {
        const resolvedPairs = resolveRenamePairs(child.columns, node.pairs, child.aliases);
        const renameMap = new Map<string, string>(resolvedPairs);
        aliases = Object.fromEntries(
          Object.entries(child.aliases).map(([alias, cols]) => [alias, cols.map((col) => renameMap.get(col) ?? col)]),
        );
      }
      if (node.relationAlias) {
        aliases = { [node.relationAlias]: [...columns] };
      }
      return { columns, aliases };
    }
    case 'join': {
      if (node.theta) {
        return inferNodeContext({ type: 'product', left: node.left, right: node.right }, schema);
      }
      const left = inferNodeContext(node.left, schema);
      const right = inferNodeContext(node.right, schema);
      const common = new Set(left.columns.filter((column) => right.columns.includes(column)));
      const columns = [...left.columns, ...right.columns.filter((column) => !common.has(column))];
      return { columns, aliases: combineAliases(columns, left.aliases, right.aliases) };
    }
    case 'product': {
      const left = inferNodeContext(node.left, schema);
      const leftSet = new Set(left.columns);
      const right = inferNodeContext(node.right, schema);
      const rightCols = right.columns.map((column) => (leftSet.has(column) ? `${column}_r` : column));
      const columns = [...left.columns, ...rightCols];
      return { columns, aliases: combineAliases(columns, left.aliases, right.aliases) };
    }
    case 'union':
    case 'difference':
    case 'intersection':
      return inferNodeContext(node.left, schema);
    case 'division':
      throw new TranslationError('RA division is not supported by the automatic SQL translator.');
  }
}

function nextAlias(aliasCounter: { value: number }): string {
  return `subq_${++aliasCounter.value}`;
}

function wrapSubquery(sql: string, aliasCounter: { value: number }, aliasOverride?: string): string {
  const alias = aliasOverride ?? nextAlias(aliasCounter);
  return `(\n${indentSql(sql)}\n) AS ${alias}`;
}

function toSql(node: RaNode, aliasCounter: { value: number }, schema: TranslationSchema): string {
  switch (node.type) {
    case 'union':
      return `${toSql(node.left, aliasCounter, schema)}\nUNION\n${toSql(node.right, aliasCounter, schema)}`;
    case 'difference':
      return `${toSql(node.left, aliasCounter, schema)}\nEXCEPT\n${toSql(node.right, aliasCounter, schema)}`;
    case 'intersection':
      return `${toSql(node.left, aliasCounter, schema)}\nINTERSECT\n${toSql(node.right, aliasCounter, schema)}`;
    case 'division':
      throw new TranslationError('RA division is not supported by the automatic SQL translator.');
    default:
      return toSelectSql(node, aliasCounter, schema);
  }
}

function toSelectSql(node: RaNode, aliasCounter: { value: number }, schema: TranslationSchema): string {
  let projection: string[] | null = null;
  const selections: string[] = [];
  const renamePairs: Array<[string, string]> = [];
  let current = node;

  while (
    current.type === 'projection'
    || current.type === 'selection'
    || (current.type === 'rename' && current.pairs.length > 0 && current.relationAlias === null)
  ) {
    if (current.type === 'projection') {
      if (projection === null) projection = current.attrs;
      current = current.sub;
      continue;
    }

    if (current.type === 'selection') {
      selections.push(current.cond);
      current = current.sub;
      continue;
    }

    renamePairs.push(...current.pairs);
    current = current.sub;
  }

  const from = toFromSql(current, aliasCounter, schema);
  const renameByOutput = new Map(renamePairs.map(([fromAttr, toAttr]) => [toAttr, fromAttr]));
  const selectList = projection
    ? projection.map((attr) => {
      const source = renameByOutput.get(attr);
      return source ? `${source} AS ${attr}` : attr;
    }).join(', ')
    : '*';
  const lines = [
    `SELECT ${projection ? `DISTINCT ${selectList}` : selectList}`,
    `FROM ${from}`,
  ];

  if (selections.length) {
    lines.push(`WHERE ${selections.reverse().join(' AND ')}`);
  }

  return lines.join('\n');
}

function toRenameSql(node: Extract<RaNode, { type: 'rename' }>, aliasCounter: { value: number }, schema: TranslationSchema): string {
  const childContext = inferNodeContext(node.sub, schema);
  const childSchema = childContext.columns;
  const renamedSchema = mapRenamedSchema(childSchema, node.pairs, childContext.aliases);
  const inner = toFromOperandSql(node.sub, aliasCounter, schema);
  const selectList = childSchema.map((column, index) => {
    const renamed = renamedSchema[index]!;
    return renamed === column ? column : `${column} AS ${renamed}`;
  });
  const sql = [
    `SELECT ${selectList.join(', ')}`,
    `FROM ${inner}`,
  ].join('\n');
  const aliasOverride = node.relationAlias
    ?? (node.sub.type === 'rename' && node.sub.relationAlias ? node.sub.relationAlias : undefined);
  return wrapSubquery(sql, aliasCounter, aliasOverride);
}

function toFromSql(node: RaNode, aliasCounter: { value: number }, schema: TranslationSchema): string {
  switch (node.type) {
    case 'relation':
      return node.name;
    case 'rename': {
      if (!node.pairs.length) {
        if (!node.relationAlias) {
          throw new TranslationError('Rename requires a relation alias or at least one attribute mapping.');
        }
        if (node.sub.type === 'relation') {
          return `${node.sub.name} AS ${node.relationAlias}`;
        }
        return wrapSubquery([
          'SELECT *',
          `FROM ${toFromOperandSql(node.sub, aliasCounter, schema)}`,
        ].join('\n'), aliasCounter, node.relationAlias);
      }
      return toRenameSql(node, aliasCounter, schema);
    }
    case 'join': {
      const left = toFromOperandSql(node.left, aliasCounter, schema);
      const right = toFromOperandSql(node.right, aliasCounter, schema);
      if (node.theta) return `${left} JOIN ${right} ON ${node.theta}`;
      return `${left} NATURAL JOIN ${right}`;
    }
    case 'product': {
      const left = toFromOperandSql(node.left, aliasCounter, schema);
      const right = toFromOperandSql(node.right, aliasCounter, schema);
      return `${left} CROSS JOIN ${right}`;
    }
    case 'projection':
    case 'selection':
    case 'union':
    case 'difference':
    case 'intersection': {
      return wrapSubquery(toSql(node, aliasCounter, schema), aliasCounter);
    }
    case 'division':
      throw new TranslationError('RA division is not supported by the automatic SQL translator.');
  }
}

function toFromOperandSql(node: RaNode, aliasCounter: { value: number }, schema: TranslationSchema): string {
  switch (node.type) {
    case 'relation':
      return node.name;
    case 'rename':
      return toFromSql(node, aliasCounter, schema);
    case 'join':
    case 'product':
      return `(${toFromSql(node, aliasCounter, schema)})`;
    case 'projection':
    case 'selection':
    case 'union':
    case 'difference':
    case 'intersection': {
      return wrapSubquery(toSql(node, aliasCounter, schema), aliasCounter);
    }
    case 'division':
      throw new TranslationError('RA division is not supported by the automatic SQL translator.');
  }
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === delimiter && depth === 0) {
      const item = current.trim();
      if (item) items.push(item);
      current = '';
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) items.push(tail);
  return items;
}

function findTopLevelSetOperator(sql: string): { index: number; operator: 'UNION' | 'EXCEPT' | 'INTERSECT' } | null {
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;

    for (const operator of ['UNION', 'EXCEPT', 'INTERSECT'] as const) {
      if (sql.slice(index, index + operator.length).toUpperCase() !== operator) continue;
      const prev = sql[index - 1];
      const next = sql[index + operator.length];
      if (isIdentifierChar(prev) || isIdentifierChar(next)) continue;
      return { index, operator };
    }
  }

  return null;
}

function extractSection(sql: string, startKeyword: string, endKeywords: string[]): string {
  const upper = sql.toUpperCase();
  const start = upper.indexOf(startKeyword);
  if (start === -1) return '';

  const searchStart = start + startKeyword.length;
  const candidates = endKeywords
    .map((keyword) => upper.indexOf(keyword, searchStart))
    .filter((index) => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : sql.length;
  return sql.slice(searchStart, end).trim();
}

function parseRelationSpec(spec: string): RaNode {
  const compact = collapseWhitespace(spec);
  if (!compact) throw new TranslationError('Missing relation in FROM clause.');
  if (compact.includes('(') || compact.includes(')')) {
    throw new TranslationError('Subqueries in the FROM clause are not supported by the automatic RA translator.');
  }

  const asMatch = compact.match(/^([A-Za-z_][A-Za-z0-9_.]*)(?:\s+AS)?\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (asMatch) {
    return {
      type: 'rename',
      relationAlias: asMatch[2],
      pairs: [],
      sub: { type: 'relation', name: asMatch[1] },
    };
  }

  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(compact)) {
    throw new TranslationError(`Unsupported relation reference "${compact}".`);
  }

  return { type: 'relation', name: compact };
}

function parseJoinClause(clause: string): { type: 'join' | 'product'; right: RaNode; theta: string | null } {
  const compact = collapseWhitespace(clause);
  const upper = compact.toUpperCase();

  if (upper.startsWith('LEFT JOIN') || upper.startsWith('RIGHT JOIN') || upper.startsWith('FULL JOIN')) {
    throw new TranslationError('Outer joins are not supported by the automatic RA translator.');
  }

  if (upper.startsWith('CROSS JOIN ')) {
    return { type: 'product', right: parseRelationSpec(compact.slice('CROSS JOIN '.length)), theta: null };
  }

  if (upper.startsWith('NATURAL JOIN ')) {
    return { type: 'join', right: parseRelationSpec(compact.slice('NATURAL JOIN '.length)), theta: null };
  }

  const normalized = upper.startsWith('INNER JOIN ')
    ? compact.slice('INNER JOIN '.length)
    : upper.startsWith('JOIN ')
      ? compact.slice('JOIN '.length)
      : compact;

  const onMatch = normalized.match(/^(.+?)\s+ON\s+(.+)$/i);
  if (!onMatch) {
    throw new TranslationError(`JOIN clause "${compact}" must include ON or use NATURAL/CROSS JOIN.`);
  }

  return {
    type: 'join',
    right: parseRelationSpec(onMatch[1]),
    theta: onMatch[2].trim(),
  };
}

type SelectItem = {
  source: string;
  output: string;
};

function replaceQualifiedReferences(expression: string, replacements: Map<string, string>): string {
  if (!expression.trim() || replacements.size === 0) return expression;

  let result = '';
  let index = 0;

  while (index < expression.length) {
    const char = expression[index]!;
    if (char === '\'' || char === '"') {
      const quote = char;
      let end = index + 1;
      while (end < expression.length) {
        const current = expression[end]!;
        if (current === '\\' && end + 1 < expression.length) {
          end += 2;
          continue;
        }
        end += 1;
        if (current === quote) break;
      }
      result += expression.slice(index, end);
      index = end;
      continue;
    }

    if (!isIdentifierStart(char)) {
      result += char;
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < expression.length && isIdentifierChar(expression[end])) end += 1;
    const token = expression.slice(index, end);
    result += replacements.get(token) ?? token;
    index = end;
  }

  return result;
}

function applyQualifiedSelectRenames(node: RaNode, renameMap: Map<string, Array<[string, string]>>): RaNode {
  if (renameMap.size === 0) return node;

  switch (node.type) {
    case 'relation': {
      const pairs = renameMap.get(node.name) ?? [];
      if (pairs.length === 0) return node;
      return { type: 'rename', relationAlias: null, pairs, sub: node };
    }
    case 'rename': {
      const key = node.relationAlias ?? (node.sub.type === 'relation' ? node.sub.name : null);
      const extraPairs = key ? (renameMap.get(key) ?? []) : [];
      const updatedSub = applyQualifiedSelectRenames(node.sub, renameMap);
      if (extraPairs.length === 0) {
        return updatedSub === node.sub ? node : { ...node, sub: updatedSub };
      }
      return {
        type: 'rename',
        relationAlias: node.relationAlias,
        pairs: [...node.pairs, ...extraPairs],
        sub: updatedSub,
      };
    }
    case 'projection':
      return { ...node, sub: applyQualifiedSelectRenames(node.sub, renameMap) };
    case 'selection':
      return { ...node, sub: applyQualifiedSelectRenames(node.sub, renameMap) };
    case 'join':
      return {
        ...node,
        left: applyQualifiedSelectRenames(node.left, renameMap),
        right: applyQualifiedSelectRenames(node.right, renameMap),
      };
    case 'product':
      return {
        ...node,
        left: applyQualifiedSelectRenames(node.left, renameMap),
        right: applyQualifiedSelectRenames(node.right, renameMap),
      };
    case 'union':
    case 'difference':
    case 'intersection':
    case 'division':
      return {
        ...node,
        left: applyQualifiedSelectRenames(node.left, renameMap),
        right: applyQualifiedSelectRenames(node.right, renameMap),
      };
  }
}

function rewriteQualifiedReferences(node: RaNode, replacements: Map<string, string>): RaNode {
  if (replacements.size === 0) return node;

  switch (node.type) {
    case 'selection':
      return {
        ...node,
        cond: replaceQualifiedReferences(node.cond, replacements),
        sub: rewriteQualifiedReferences(node.sub, replacements),
      };
    case 'join':
      return {
        ...node,
        theta: node.theta ? replaceQualifiedReferences(node.theta, replacements) : null,
        left: rewriteQualifiedReferences(node.left, replacements),
        right: rewriteQualifiedReferences(node.right, replacements),
      };
    case 'projection':
      return { ...node, sub: rewriteQualifiedReferences(node.sub, replacements) };
    case 'rename':
      return { ...node, sub: rewriteQualifiedReferences(node.sub, replacements) };
    case 'product':
    case 'union':
    case 'difference':
    case 'intersection':
    case 'division':
      return {
        ...node,
        left: rewriteQualifiedReferences(node.left, replacements),
        right: rewriteQualifiedReferences(node.right, replacements),
      };
    case 'relation':
      return node;
  }
}

function parseSelectItems(selectBody: string): SelectItem[] {
  return splitTopLevel(selectBody, ',').map((item) => {
    const trimmed = item.trim();
    const aliasMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_.]*)$/i);
    if (aliasMatch) {
      return {
        source: aliasMatch[1].trim(),
        output: aliasMatch[2].trim(),
      };
    }
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(trimmed)) {
      return {
        source: trimmed,
        output: trimmed,
      };
    }
    throw new TranslationError('Only simple attribute projections and aliases are supported by the automatic RA translator.');
  });
}

function parseSimpleSqlToRa(sql: string): RaNode {
  const compact = collapseWhitespace(sql).replace(/;$/, '');
  const upper = compact.toUpperCase();

  if (!upper.startsWith('SELECT ')) {
    throw new TranslationError('Only SELECT statements are supported by the automatic RA translator.');
  }

  for (const unsupported of [' GROUP BY ', ' HAVING ', ' ORDER BY ', ' LIMIT ']) {
    if (upper.includes(unsupported)) {
      throw new TranslationError(`${unsupported.trim()} is not supported by the automatic RA translator.`);
    }
  }

  const selectBody = extractSection(compact, 'SELECT', [' FROM ']);
  const fromBody = extractSection(compact, 'FROM', [
    ' JOIN ',
    ' INNER JOIN ',
    ' LEFT JOIN ',
    ' RIGHT JOIN ',
    ' FULL JOIN ',
    ' CROSS JOIN ',
    ' NATURAL JOIN ',
    ' WHERE ',
  ]);
  const whereBody = extractSection(compact, 'WHERE', []);
  const joins = [
    ...compact.matchAll(/((?:(?:INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)\s+)?JOIN\s+.+?)(?=\s+(?:(?:(?:INNER|LEFT|RIGHT|FULL|CROSS|NATURAL)\s+)?JOIN|WHERE)|$)/gi),
  ].map((match) => match[1].trim());

  if (!fromBody) {
    throw new TranslationError('SELECT statements must include a FROM clause.');
  }

  const baseRelations = splitTopLevel(fromBody, ',').map(parseRelationSpec);
  let current = baseRelations[0]!;
  for (let index = 1; index < baseRelations.length; index += 1) {
    current = { type: 'product', left: current, right: baseRelations[index]! };
  }

  for (const joinClause of joins) {
    const parsed = parseJoinClause(joinClause);
    current = parsed.type === 'product'
      ? { type: 'product', left: current, right: parsed.right }
      : { type: 'join', left: current, right: parsed.right, theta: parsed.theta };
  }

  if (whereBody) {
    current = { type: 'selection', cond: whereBody, sub: current };
  }

  const selectCompact = selectBody.replace(/^DISTINCT\s+/i, '').trim();
  if (selectCompact !== '*') {
    const selectItems = parseSelectItems(selectCompact);
    const qualifiedRenamePairs = new Map<string, Array<[string, string]>>();
    const qualifiedReferenceReplacements = new Map<string, string>();

    for (const item of selectItems) {
      const sourceMatch = item.source.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
      if (!sourceMatch || item.source === item.output) continue;
      const [, relationAlias, attribute] = sourceMatch;
      const existing = qualifiedRenamePairs.get(relationAlias) ?? [];
      existing.push([attribute, item.output]);
      qualifiedRenamePairs.set(relationAlias, existing);
      qualifiedReferenceReplacements.set(item.source, item.output);
    }

    if (qualifiedRenamePairs.size) {
      current = applyQualifiedSelectRenames(current, qualifiedRenamePairs);
      current = rewriteQualifiedReferences(current, qualifiedReferenceReplacements);
    }

    const renamePairs = selectItems
      .filter((item) => item.source !== item.output)
      .filter((item) => !qualifiedReferenceReplacements.has(item.source))
      .map((item) => [item.source, item.output] as [string, string]);
    if (renamePairs.length) {
      current = { type: 'rename', relationAlias: null, pairs: renamePairs, sub: current };
    }
    current = { type: 'projection', attrs: selectItems.map((item) => item.output), sub: current };
  }

  return current;
}

export function translateRaToSql(expression: string, schema: TranslationSchema = {}): TranslationOutcome {
  const parser = new RaParser(expression.trim());
  const ast = parser.parse();
  return {
    translated: toSql(ast, { value: 0 }, schema),
  };
}

export function translateSqlToRa(sql: string): TranslationOutcome {
  const compact = collapseWhitespace(sql).replace(/;$/, '');
  const setOperator = findTopLevelSetOperator(compact);

  if (setOperator) {
    const left = translateSqlToRa(compact.slice(0, setOperator.index));
    const right = translateSqlToRa(compact.slice(setOperator.index + setOperator.operator.length));
    const operator = setOperator.operator === 'UNION'
      ? '∪'
      : setOperator.operator === 'EXCEPT'
        ? '−'
        : '∩';
    return {
      translated: `(${left.translated}) ${operator} (${right.translated})`,
    };
  }

  return {
    translated: renderRa(parseSimpleSqlToRa(compact)),
  };
}
