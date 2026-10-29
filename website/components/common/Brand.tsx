import { BookOpen } from 'lucide-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <BookOpen size={22} />
      </span>
      <span>
        <b>自习之间</b>
        <small>STUDY COMMONS</small>
      </span>
    </div>
  );
}
