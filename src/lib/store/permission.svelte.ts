import type { ProjectPermissionLevel } from '$lib/types/auth';

class PermissionStore {
  current = $state<ProjectPermissionLevel | null>(null);

  get isReadOnly(): boolean {
    // null means local mode (no auth) → full access
    if (this.current === null) return false;
    return this.current === 'viewer';
  }

  get canEdit(): boolean {
    if (this.current === null) return true;
    return this.current === 'editor' || this.current === 'owner';
  }

  get isOwner(): boolean {
    if (this.current === null) return true;
    return this.current === 'owner';
  }

  set(permission: ProjectPermissionLevel | null) {
    this.current = permission;
  }
}

export const permissionStore = new PermissionStore();
