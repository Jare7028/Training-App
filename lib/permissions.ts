export const roles = ['admin', 'editor', 'viewer'] as const;
export type WorkspaceRole = typeof roles[number];
export const roleLabels: Record<WorkspaceRole, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
export const roleDescriptions: Record<WorkspaceRole, string> = {
    admin: 'Manage accounts, edit assessments and modules, issue links and review candidates.',
    editor: 'Edit assessments and modules, issue links and review candidates.',
    viewer: 'Read assessments, modules and candidate results. No changes or account management.',
};
export function isRole(value: unknown): value is WorkspaceRole {
    return typeof value === 'string' && roles.includes(value as WorkspaceRole);
}
export function canEdit(role: WorkspaceRole) { return role === 'admin' || role === 'editor'; }
export type WorkspaceAccount = {
    id: string;
    email: string;
    username?: string;
    name: string;
    role: WorkspaceRole;
    status: 'active' | 'suspended';
    revision: number;
    createdAt: number;
    owner: boolean;
    setupPending: boolean;
};
