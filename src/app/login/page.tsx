'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function WadiAdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMsg('بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور.');
        setLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      const roleValue = String(prof?.role ?? prof?.user_role ?? '').toLowerCase();
      if (roleValue && roleValue !== 'admin') {
        await supabase.auth.signOut();
        setErrorMsg('هذا الحساب ليس حساب مدير (admin) في لوحة ودي.');
        setLoading(false);
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setErrorMsg('حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.');
      setLoading(false);
    }
  };

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b0f17',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: 20,
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>دخول إدارة ودي</h1>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
          سجّل الدخول بحساب المدير للوصول إلى لوحة التحكم
        </p>

        {errorMsg && (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: '#450a0a',
              border: '1px solid #ef4444',
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          البريد الإلكتروني
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@wadi.iq"
            style={{
              padding: 10,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#fff',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          كلمة المرور
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              padding: 10,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#fff',
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 11,
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </main>
  );
}
