export enum Page {
  SystemOwner,
  CustomContent,
  CustomPageEditor,
  DisplayWindow,
  SuperAdmin,
  DisplayScreenEditor,
}

export interface MenuItem {
  title: string;
  action: () => void;
  subTitle?: string;
  disabled?: boolean;
  colorClass?: string;
}

export interface AppNotification {
  id: string;
  createdAt: string; // ISO string
  type: 'info' | 'warning' | 'success' | 'suggestion' | 'error';
  title: string;
  message: string;
  isRead: boolean;
  relatedScreenId?: string; // To identify the source
  relatedPostId?: string;
}
