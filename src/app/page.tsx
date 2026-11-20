'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

interface Profile {
  id: string;
  role?: string | null;
  status?: string | null;
  full_name?: string | null;
}

interface DashboardStats {
  ordersCount: number;
  driversCount: number;
  partnersCount: number;
}

export default function WadiAdminHomePage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    ordersCount: 0,
    driversCount: 0,
    partnersCount: 0,
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/login');
        return;
      }

      const { data: prof, error: profError } = await supabase
        .from('profiles')
        .select('id, role, status, full_name')
        .eq('id', user.id)
        .single();

      if (profError || !prof || prof.role !== 'admin' || prof.status === 'suspended') {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      setProfile(prof);

      const [ordersRes, driversRes, partnersRes] = await Promise.all([
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'driver'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'partner'),
      ]);

      setStats({
        ordersCount: ordersRes.count ?? 0,
        driversCount: driversRes.count ?? 0,
        partnersCount: partnersRes.count ?? 0,
      });
    } catch {
      setErrorMsg('تعذر تحميل بيانات لوحة إدارة ودي. تحقق من الاتصال أو الجداول.');
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <main dir="rtl" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b0f17', color: '#fff', fontFamily: 'sans-serif' }}>
        <p>جاري التحقق من صلاحيات الإدارة وتحميل لوحة ودي...</p>
      </main>
    );
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#0b0f17', color: '#f8fafc', padding: '24px', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>لوحة إدارة ودي (Wadi Admin)</h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '14px' }}>
            مرحباً {profile?.full_name || 'بالمدير'} — متصل بقاعدة بيانات Wadi 67
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={loadDashboard}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #334155', background: '#1e293b', color: '#fff', cursor: 'pointer' }}
          >
            تحديث
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer' }}
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      {errorMsg && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#451a1a', border: '1px solid #ef4444', marginBottom: '20px' }}>
          {errorMsg}
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div style={{ padding: '20px', borderRadius: '12px', background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ color: '#94a3b8', fontSize: '14px' }}>إجمالي الطلبات</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '8px' }}>{stats.ordersCount}</div>
        </div>

        <div style={{ padding: '20px', borderRadius: '12px', background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ color: '#94a3b8', fontSize: '14px' }}>السائقون</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '8px' }}>{stats.driversCount}</div>
        </div>

        <div style={{ padding: '20px', borderRadius: '12px', background: '#111827', border: '1px solid #1f2937' }}>
          <div style={{ color: '#94a3b8', fontSize: '14px' }}>الشركاء والمتاجر</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '8px' }}>{stats.partnersCount}</div>
        </div>
      </section>
    </main>
  );
}
