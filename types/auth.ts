export type UserRole = 'organizationadmin' | 'systemowner' | 'member' | 'staff';

export interface UserData {
  uid: string;
  email: string;
  role: UserRole;
  organizationId?: string; // Which organization they belong to
  adminRole?: 'superadmin' | 'admin'; // granular role for org admins
  screenPin?: string; // PIN for accessing admin menu on a screen
  // Add a list of location IDs this staff member has access to.
  // If undefined or empty, they have access to all locations in the organization.
  accessibleLocationIds?: string[];
}
