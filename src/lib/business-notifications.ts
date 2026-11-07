export type BusinessNotification = {
  id: string;
  title: string;
  businessName: string;
  expiresAt: string;
  createdAt: string;
  readAt: string | null;
  revokedAt: string | null;
};
export type NotificationInbox = {
  notifications: BusinessNotification[];
  unreadCount: number;
};
