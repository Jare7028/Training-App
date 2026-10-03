export type RequestColumn = { id: string; name: string };
export type RequestAssignee = { id: string; name: string; status: string };
export type RequestImage = { id: string; requestId: string; name: string; url: string; bytes: number };
export type WorkspaceRequest = {
    id: string; title: string; description: string; columnId: string;
    assigneeId: string | null; priority: 'low' | 'normal' | 'high' | 'urgent';
    position: number; revision: number; updatedAt: number; images: RequestImage[];
};
export const defaultRequestColumns: RequestColumn[] = [
    { id: 'new', name: 'New' }, { id: 'in-progress', name: 'In progress' }, { id: 'done', name: 'Done' },
];
export const requestPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export const requestImageBucket = 'workspace-request-images';
export const maxRequestImageBytes = 3 * 1024 * 1024;
