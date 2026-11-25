import type { TagItem } from '@beauty-crm/shared';

export function TagChip({ tag, on, onClick, small }: { tag: Pick<TagItem, 'name' | 'color'>; on?: boolean; onClick?: () => void; small?: boolean }) {
  const style = { '--tag': tag.color ?? '#6b6870' } as React.CSSProperties;
  const cls = `chip ${on ? 'on' : ''} ${small ? 'chip-sm' : ''}`;
  if (!onClick) {
    return (
      <span className={cls} style={style}>
        {tag.name}
      </span>
    );
  }
  return (
    <button type="button" className={cls} style={style} onClick={onClick} aria-pressed={!!on}>
      {tag.name}
    </button>
  );
}
