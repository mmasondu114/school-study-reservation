import { Settings, User } from './model';

export type Page =
  | 'overview'
  | 'reserve'
  | 'bookings'
  | 'report'
  | 'appeal'
  | 'account'
  | 'review'
  | 'admin'
  | 'feedback';

export type Call = (action: string, input?: Record<string, any>) => Promise<any>;

export interface CommonProps {
  api: Call;
  notify: (s: string) => void;
  updated: () => void;
  demo: boolean;
  user: User;
  settings: Settings;
  revision: number;
}
