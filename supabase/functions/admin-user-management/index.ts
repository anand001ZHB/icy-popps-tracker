import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Use POST for this action.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Server setup is incomplete. Ask the platform owner to check Edge Function secrets.' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Please sign in first.' }, 401);
  const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401);

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error: callerError } = await admin.from('profiles')
    .select('id,role,vendor_id,approval_status,is_platform_admin')
    .eq('id', authData.user.id).maybeSingle();
  if (callerError || !caller || caller.approval_status !== 'approved' || caller.role !== 'admin') {
    return json({ error: 'Only an approved cart Admin can manage users.' }, 403);
  }
  const isPlatformAdmin = caller.is_platform_admin === true;
  if (!isPlatformAdmin && !caller.vendor_id) return json({ error: 'Your account is not linked to a cart workspace.' }, 403);

  let input: { action?: string; userId?: string; vendorId?: string; role?: string };
  try { input = await req.json(); } catch { return json({ error: 'The request could not be read. Please try again.' }, 400); }

  if (input.action === 'list') {
    let usersQuery = admin.from('profiles')
      .select('id,full_name,role,vendor_id,approval_status,created_at,requested_vendor_code,is_platform_admin')
      .order('created_at', { ascending: false });
    let vendorQuery = admin.from('vendors').select('id,name,registration_code,status').order('name');
    if (!isPlatformAdmin) {
      const { data: ownVendor, error: ownVendorError } = await admin.from('vendors')
        .select('id,registration_code').eq('id', caller.vendor_id).maybeSingle();
      if (ownVendorError || !ownVendor) return json({ error: 'Your cart workspace could not be loaded.' }, 500);
      const code = ownVendor.registration_code || '';
      // Include approved/current members and pending registrations that supplied this cart's code.
      const { data: allProfiles, error: pErr } = await usersQuery;
      if (pErr) return json({ error: 'Could not load your cart users. Check the database setup.' }, 500);
      const users = (allProfiles || []).filter((p: any) =>
        p.vendor_id === caller.vendor_id || (p.approval_status !== 'approved' && p.requested_vendor_code === code)
      );
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const emailById = new Map<string,string>();
      for (const u of authUsers?.users || []) emailById.set(u.id,u.email || '');
      return json({ users: users.map((u:any)=>({...u,email:emailById.get(u.id)||''})), vendors: [ownVendor], vendorRequests: [] });
    }

    const [{ data: users, error: usersError }, { data: vendors, error: vendorsError }, { data: requests, error: requestsError }] = await Promise.all([
      usersQuery,
      vendorQuery,
      admin.from('vendor_registration_requests').select('id,user_id,vendor_name,address,pincode,status,created_at').eq('status','pending').order('created_at',{ascending:true}),
    ]);
    if (usersError || vendorsError || requestsError) return json({ error: 'Could not load registrations. Check that the vendor registration migration has been applied.' }, 500);
    const ids = (users || []).map((u:any)=>u.id);
    const { data: authUsers, error: authUsersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailById = new Map<string,string>();
    for (const u of authUsers?.users || []) emailById.set(u.id,u.email || '');
    const nameById = new Map<string,string>();
    for (const u of authUsers?.users || []) nameById.set(u.id,String(u.user_metadata?.full_name || ''));
    return json({
      // Include Admin accounts for visibility; the frontend renders them read-only.
      // The approval action below explicitly refuses to change Admin accounts.
      users: (users || []).filter((u:any)=>ids.includes(u.id)).map((u:any)=>({...u,email:emailById.get(u.id)||''})),
      vendors: vendors || [],
      vendorRequests: (requests || []).map((r:any)=>({...r,full_name:nameById.get(r.user_id)||'',email:emailById.get(r.user_id)||''})),
    });
  }

  if (input.action === 'approve-vendor') {
    if (!isPlatformAdmin) return json({ error: 'Only the Icy Popps platform owner can approve new carts.' }, 403);
    if (!input.userId) return json({ error: 'Choose a cart registration to approve.' }, 400);
    const { data: request, error: reqError } = await admin.from('vendor_registration_requests')
      .select('*').eq('user_id', input.userId).eq('status','pending').maybeSingle();
    if (reqError || !request) return json({ error: 'This cart request was not found or was already reviewed.' }, 404);

    const baseCode = `ICY-${request.pincode}`;
    let code = baseCode;
    let suffix = 2;
    while (true) {
      const { data: exists, error: lookupError } = await admin.from('vendors').select('id').eq('registration_code',code).maybeSingle();
      if (lookupError) return json({ error: 'Could not check vendor code uniqueness. Please try again.' }, 500);
      if (!exists) break;
      code = `${baseCode}-${String(suffix).padStart(2,'0')}`;
      suffix += 1;
      if (suffix > 999) return json({ error: 'Could not generate a unique cart code. Contact support.' }, 500);
    }

    const { data: vendor, error: vendorError } = await admin.from('vendors').insert({
      name: request.vendor_name, address: request.address, pincode: request.pincode,
      registration_code: code, status: 'active', owner_user_id: request.user_id
    }).select('id').single();
    if (vendorError || !vendor) return json({ error: 'Could not activate this cart. Check the vendor migration and try again.' }, 500);

    const { error: profileError } = await admin.from('profiles').update({
      vendor_id: vendor.id, role: 'admin', approval_status: 'approved', is_platform_admin: false, requested_vendor_code: null
    }).eq('id', request.user_id);
    if (profileError) {
      await admin.from('vendors').delete().eq('id',vendor.id);
      return json({ error: 'The cart was not activated because its owner profile could not be updated.' }, 500);
    }
    await admin.from('vendor_registration_requests').update({status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:authData.user.id}).eq('id',request.id);
    return json({ success: true, vendorId: vendor.id, registrationCode: code });
  }

  if (input.action === 'disable-user' || input.action === 'enable-user' || input.action === 'delete-user') {
    if (!input.userId) return json({ error: 'Choose a user account first.' }, 400);
    if (input.userId === authData.user.id) return json({ error: 'You cannot disable or delete your own signed-in account.' }, 403);
    const { data: target, error: targetError } = await admin.from('profiles')
      .select('id,role,vendor_id,approval_status,is_platform_admin').eq('id', input.userId).maybeSingle();
    if (targetError || !target) return json({ error: 'That user account was not found.' }, 404);
    if (!isPlatformAdmin) {
      if (target.role === 'admin' || target.is_platform_admin) return json({ error: 'Cart Admins can only delete staff and managers.' }, 403);
      if (target.vendor_id !== caller.vendor_id) return json({ error: 'You can only manage users in your own cart.' }, 403);
      if (input.action !== 'delete-user') return json({ error: 'Only the platform owner can disable or enable accounts.' }, 403);
    }
    if (input.action === 'disable-user' || input.action === 'enable-user') {
      if (!isPlatformAdmin) return json({ error: 'Only the platform owner can disable or enable accounts.' }, 403);
      const nextStatus = input.action === 'disable-user' ? 'disabled' : 'approved';
      const { error: updateError } = await admin.from('profiles').update({ approval_status: nextStatus }).eq('id', input.userId);
      if (updateError) return json({ error: 'Could not update this account status.' }, 500);
      return json({ success: true, approvalStatus: nextStatus });
    }
    // Preserve business history by reassigning required profile references before deleting the account.
    const { error: entriesRefError } = await admin.from('daily_entries').update({ created_by: authData.user.id }).eq('created_by', input.userId);
    if (entriesRefError) return json({ error: 'Could not preserve daily-record history before deleting this account.' }, 500);
    const { error: fixedCostRefError } = await admin.from('fixed_cost_items').update({ updated_by: authData.user.id }).eq('updated_by', input.userId);
    if (fixedCostRefError) return json({ error: 'Could not preserve fixed-cost history before deleting this account.' }, 500);
    const { error: settingsRefError } = await admin.from('product_settings').update({ updated_by: authData.user.id }).eq('updated_by', input.userId);
    if (settingsRefError) return json({ error: 'Could not preserve settings history before deleting this account.' }, 500);
    // Remove a pending cart registration before deleting its auth user; profiles are configured to cascade from auth.users.
    await admin.from('vendor_registration_requests').delete().eq('user_id', input.userId);
    const { error: deleteError } = await admin.auth.admin.deleteUser(input.userId);
    if (deleteError) return json({ error: 'Could not delete this account. It may still be referenced by business records.' }, 500);
    return json({ success: true });
  }

  if (input.action === 'disable-vendor' || input.action === 'enable-vendor' || input.action === 'delete-vendor') {
    if (!isPlatformAdmin) return json({ error: 'Only the platform owner can manage vendor workspaces.' }, 403);
    if (!input.vendorId) return json({ error: 'Choose a vendor workspace first.' }, 400);
    const { data: vendor, error: vendorLookupError } = await admin.from('vendors').select('id,name,status,owner_user_id').eq('id', input.vendorId).maybeSingle();
    if (vendorLookupError || !vendor) return json({ error: 'That vendor workspace was not found.' }, 404);
    if (input.action === 'disable-vendor' || input.action === 'enable-vendor') {
      const status = input.action === 'disable-vendor' ? 'suspended' : 'active';
      const { error: updateError } = await admin.from('vendors').update({ status }).eq('id', input.vendorId);
      if (updateError) return json({ error: 'Could not update the vendor status.' }, 500);
      return json({ success: true, status });
    }
    // Permanent deletion: remove known vendor-scoped data first, then linked accounts and the vendor.
    const { data: linkedProfiles, error: linkedError } = await admin.from('profiles').select('id').eq('vendor_id', input.vendorId);
    if (linkedError) return json({ error: 'Could not load accounts linked to this vendor.' }, 500);
    if ((linkedProfiles || []).some((profile: any) => profile.id === authData.user.id)) return json({ error: 'Your own platform account is linked to this vendor. Move your platform account to another workspace before deleting it.' }, 403);
    const { error: entryDeleteError } = await admin.from('daily_entries').delete().eq('vendor_id', input.vendorId);
    if (entryDeleteError) return json({ error: 'Could not delete the vendor daily records. No vendor account was deleted.' }, 500);
    const { error: costDeleteError } = await admin.from('fixed_cost_items').delete().eq('vendor_id', input.vendorId);
    if (costDeleteError) return json({ error: 'Could not delete vendor fixed costs. No vendor account was deleted.' }, 500);
    const { error: settingsDeleteError } = await admin.from('product_settings').delete().eq('vendor_id', input.vendorId);
    if (settingsDeleteError) return json({ error: 'Could not delete vendor settings. No vendor account was deleted.' }, 500);
    // Remove the vendor's owner reference before deleting linked auth accounts.
    const { error: ownerRefError } = await admin.from('vendors').update({ owner_user_id: null }).eq('id', input.vendorId);
    if (ownerRefError) return json({ error: 'Could not detach the vendor owner before deletion.' }, 500);
    for (const profile of linkedProfiles || []) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(profile.id);
      if (authDeleteError) return json({ error: 'Some linked accounts could not be deleted. Vendor deletion stopped; check the remaining linked accounts.' }, 500);
    }
    const { error: vendorDeleteError } = await admin.from('vendors').delete().eq('id', input.vendorId);
    if (vendorDeleteError) return json({ error: 'Vendor records were cleaned up, but the vendor itself could not be deleted. Check other database references.' }, 500);
    return json({ success: true });
  }

  if (input.action === 'approve') {
    const targetId = input.userId;
    const role = input.role;
    if (!targetId || !['staff','manager'].includes(role || '')) return json({ error: 'Choose a user and a valid role.' }, 400);
    const { data: target, error: targetError } = await admin.from('profiles')
      .select('id,role,vendor_id,approval_status,requested_vendor_code,is_platform_admin')
      .eq('id',targetId).maybeSingle();
    if (targetError || !target) return json({ error: 'That registration was not found.' }, 404);
    if (target.is_platform_admin || target.role === 'admin') return json({ error: 'Admin accounts cannot be changed from employee approval. Use the vendor-management process instead.' }, 403);

    let vendorId = '';
    if (isPlatformAdmin) {
      vendorId = input.vendorId || target.vendor_id || '';
      if (!vendorId) return json({ error: 'Choose a vendor before approving this account.' }, 400);
    } else {
      vendorId = caller.vendor_id;
      const { data: ownVendor, error: ownVendorError } = await admin.from('vendors').select('id,registration_code').eq('id',vendorId).maybeSingle();
      if (ownVendorError || !ownVendor) return json({ error: 'Your cart workspace could not be loaded.' }, 500);
      if (target.vendor_id && target.vendor_id !== vendorId) return json({ error: 'You can only manage users in your own cart.' }, 403);
      if (target.approval_status !== 'approved' && target.requested_vendor_code !== ownVendor.registration_code) {
        return json({ error: 'This registration used a different cart code. It cannot be approved by your cart.' }, 403);
      }
    }
    const { data: vendor, error: vendorError } = await admin.from('vendors').select('id,status').eq('id',vendorId).maybeSingle();
    if (vendorError || !vendor || vendor.status === 'suspended') return json({ error: 'Choose an active vendor.' }, 400);
    const { error: updateError } = await admin.from('profiles').update({
      vendor_id: vendorId, role, approval_status: 'approved', requested_vendor_code: null
    }).eq('id',targetId);
    if (updateError) return json({ error: 'Could not approve this user. Check the database migration and try again.' }, 500);
    return json({ success: true });
  }

  return json({ error: 'Unknown user-management action.' }, 400);
});
