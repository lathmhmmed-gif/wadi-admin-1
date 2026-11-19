'use client';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShieldCheck, LogOut, RefreshCw, Package, Users, Bike, Wallet, CheckCircle, Ban } from 'lucide-react';

export default function AdminDashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tab, setTab] = useState<'orders' | 'users'>('orders');
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const { data: prof } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
    if (prof?.role !== 'admin' || prof?.status !== 'active') {
      await supabase.auth.signOut();
      router.push('/login');
      return;
    }
    const [{ data: ordData }, { data: usrData }] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('*').order('created_at', { ascending: false })
    ]);
    setOrders(ordData || []);
    setUsers(usrData || []);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    loadData();
    const channel = supabase.channel('admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData, supabase]);

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!driverId) return;
    await supabase.from('orders').update({ driver_id: driverId, status: 'accepted' }).eq('id', orderId);
    loadData();
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'suspended' : 'active';
    await supabase.from('profiles').update({ status: next }).eq('id', userId);
    loadData();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">جاري تحميل مركز العمليات...</div>;

  const drivers = users.filter(u => u.role === 'driver' && u.status === 'active');
  const delivered = orders.filter(o => o.status === 'delivered');
  const totalCommission = delivered.reduce((acc, o) => acc + Number(o.commission_amount || (Number(o.delivery_fee || 0) * 0.25)), 0);

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20">
      <header className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white">إدارة ودي - الرمادي</h1>
            <p className="text-xs text-slate-400">مراقبة حية والعمولة التلقائية 25%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="p-2.5 rounded-xl bg-red-500/15 text-red-400"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1"><span>إجمالي الطلبات</span><Package className="w-4 h-4 text-indigo-400" /></div>
          <div className="text-2xl font-bold text-white">{orders.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1"><span>أرباح المنصة (25%)</span><Wallet className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-2xl font-bold text-emerald-400">{totalCommission.toLocaleString()} <span className="text-xs">د.ع</span></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1"><span>المندوبون المتصلون</span><Bike className="w-4 h-4 text-amber-400" /></div>
          <div className="text-2xl font-bold text-white">{drivers.filter(d => d.is_online).length} / {drivers.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1"><span>الشركاء والمتاجر</span><Users className="w-4 h-4 text-sky-400" /></div>
          <div className="text-2xl font-bold text-white">{users.filter(u => u.role === 'partner').length}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('orders')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${tab === 'orders' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
          الطلبات الحية ({orders.length})
        </button>
        <button onClick={() => setTab('users')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition ${tab === 'users' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
          الشركاء والمندوبون ({users.length})
        </button>
      </div>

      {tab === 'orders' ? (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white">{o.customer_name || 'زبون'} - {o.customer_phone}</span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300">{o.status}</span>
              </div>
              <p className="text-sm text-slate-300 mb-2">📍 {o.dropoff_address} {o.zone_name ? `(${o.zone_name})` : ''}</p>
              <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-3">
                <span>سعر الطلب: <b className="text-white">{Number(o.order_amount || 0).toLocaleString()} د.ع</b></span>
                <span>التوصيل: <b className="text-white">{Number(o.delivery_fee || 0).toLocaleString()} د.ع</b></span>
                <span>عمولة ودي (25%): <b className="text-emerald-400">{Number(o.commission_amount || (Number(o.delivery_fee || 0) * 0.25)).toLocaleString()} د.ع</b></span>
              </div>
              {o.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <select onChange={(e) => assignDriver(o.id, e.target.value)} defaultValue=""
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white">
                    <option value="" disabled>إسناد يدوي لمندوب...</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name} ({d.is_online ? 'متصل' : 'غير متصل'})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-white">{u.full_name || 'بدون اسم'} <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 mr-1">{u.role}</span></div>
                <div className="text-xs text-slate-400 mt-1">{u.phone || ''} • الحالة: {u.status}</div>
              </div>
              {u.role !== 'admin' && (
                <button onClick={() => toggleUserStatus(u.id, u.status)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 ${u.status === 'active' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {u.status === 'active' ? <><Ban className="w-3.5 h-3.5" /> إيقاف</> : <><CheckCircle className="w-3.5 h-3.5" /> تفعيل</>}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
