import 'server-only';
import { authClient } from '@/lib/supabase/server';

export async function createBusiness(businessName: string, contactName: string) {
    const { data, error } = await (await authClient()).rpc('create_business', {
        business_name: businessName, contact_name: contactName,
    });
    if (error) throw new Error('Your business could not be created. Please retry.');
    return String(data);
}

export async function finishBusinessSignup() {
    const { data: { user } } = await (await authClient()).auth.getUser();
    if (!user?.email_confirmed_at || user.is_anonymous) return;
    // Metadata supplies display labels only. The database derives the owner,
    // membership and role from the verified session, never from these fields.
    const { business_name: business, full_name: name } = user.user_metadata;
    if (typeof business === 'string' && typeof name === 'string'
        && business.trim().length > 0 && business.length <= 100
        && name.trim().length > 0 && name.length <= 100) {
        await createBusiness(business, name);
    }
}
