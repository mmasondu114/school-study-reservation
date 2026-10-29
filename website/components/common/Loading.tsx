import { Loader2 } from 'lucide-react';

export function Loading({ text = '正在同步…' }: { text?: string }) {
  return (
    <div className="empty">
      <Loader2 className="spin" size={26} />
      <p>{text}</p>
    </div>
  );
}
