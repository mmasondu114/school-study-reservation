import { BookOpen } from 'lucide-react';
import React from 'react';

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty">
      <BookOpen size={28} />
      <p>{children}</p>
    </div>
  );
}
