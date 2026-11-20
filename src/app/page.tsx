'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type RawRow = Record<string, unknown>;

export interface UnifiedProfile {
  id: string;
  fullName: string;
  role: string;
  status: string;
  phone: string;
  isOnline: boolean;
}

export interface UnifiedOrder {
  id: string;
  customerName: string;
  area: string;
  status: string;
  driverId: string;
  deliveryFee: number;
  driverCommission: number;
  createdAt: string;
}

const COLUMN_ALIASES = {
  id: ['id', 'order_id', 'user_id', 'profile_id', 'uuid'],
  fullName: ['full_name', 'name', 'customer_name', 'client_name', 'recipient_name', 'store_name', 'merchant_name'],
  role: ['role', 'user_role', 'account_type', 'type'],
  status: ['status', 'order_status', 'account_status', 'driver_status', 'state'],
  phone: ['phone', 'mobile', 'phone_number', 'tel', 'whatsapp'],
  area: ['area', 'district', 'city', 'region', 'address', 'dropoff_address', 'delivery_address', 'location'],
  driverId: ['driver_id', 'courier_id', 'delivery_id', 'assigned_driver_id'],
  deliveryFee: ['delivery_fee', 'delivery_price', 'shipping_fee', 'fee', 'delivery_cost', 'total_delivery'],
  commission: ['driver_commission', 'commission', 'courier_commission', 'platform_fee'],
  createdAt: ['created_at', 'inserted_at', 'updated_at', 'timestamp', 'date'],
};

function readFirstString(row: RawRow | null | undefined, keys: string[], fallback = ''): string {
  if (!row) return fallback;
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'string' && val.trim() !== '') return val.trim();
    if (typeof val === 'number' && !Number.isNaN(val)) return String(val);
  }
  return fallback;
}

function readFirstNumber(row: RawRow | null | undefined, keys: string[], fallback = 0): number {
  if (!row) return fallback;
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const cleaned = Number(val.replace(/[^\d.-]/g, ''));
      if (!Number.isNaN(cleaned)) return cleaned;
    }
  }
  return fallback;
}

function readFirstBoolean(row: RawRow | null | undefined, keys: string[]): boolean {
  if (!row) return false;
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (['true', 'online', 'available', 'active', '1', 'yes'].includes(lower)) return true;
    }
  }
  return false;
}

function unifyProfile(row: RawRow, index = 0): UnifiedProfile {
  const id = readFirstString(row, COLUMN_ALIASES.id, `profile-${index}`);
  const fullName = readFirstString(row, COLUMN_ALIASES.fullName, `مستخدم ${index + 1}`);
  const role = readFirstString(row, COLUMN_ALIASES.role, 'user').toLowerCase();
  const status = readFirstString(row, COLUMN_ALIASES.status, 'active').toLowerCase();
  const phone = readFirstString(row, COLUMN_ALIASES.phone, '');
  const onlineFlag = readFirstBoolean(row, ['is_online', 'online', 'available', 'is_available']);
  const isOnline = onlineFlag || ['online', 'available', 'active', 'ready'].includes(status);

  return { id, fullName, role, status, phone, isOnline };
}

function unifyOrder(row: RawRow, index = 0): UnifiedOrder {
  const id = readFirstString(row, COLUMN_ALIASES.id, `order-${index}`);
  const customerName = readFirstString(row, COLUMN_ALIASES.fullName, 'عميل');
  const area = readFirstString(row, COLUMN_ALIASES.area, 'غير محدد');
  const status = readFirstString(row, COLUMN_ALIASES.status, 'pending').toLowerCase();
  const driverId = readFirstString(row, COLUMN_ALIASES.driverId, '');
  const deliveryFee = readFirstNumber(row, COLUMN_ALIASES.deliveryFee, 0);

  const explicitCommission = readFirstNumber(row, COLUMN_ALIASES.commission, -1);
  const driverCommission = explicitCommission >= 0 ? explicitCommission : deliveryFee * 0.25;
  const createdAt = readFirstString(row, COLUMN_ALIASES.createdAt, '');

  return {
    id,
    customerName,
    area,
    status,
    driverId,
    deliveryFee,
    driverCommission,
    createdAt,
  };
}

function formatIQD(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} د.ع`;
}

export default function WadiAdminDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [adminName, setAdminName] = useState('المدير العام');
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [drivers, setDrivers] = useState<UnifiedProfile[]>([]);
  const [partners, setPartners] = useState<UnifiedProfile[]>([]);
  const [selectedDriverByOrder, setSelectedDriverByOrder] = useState<Record<string, string>>({});

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const localRaw = typeof window !== 'undefined' ? localStorage.getItem('wadi_admin_session') : null;
      const localSession = localRaw ? JSON.parse(localRaw) : null;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!localSession && !user) {
        router.replace('/login');
        return;
      }

      if (localSession?.name) {
        setAdminName(localSession.name);
      } else if (user?.email) {
        setAdminName(user.email);
      }

      const [ordersRes, profilesRes] = await Promise.allSettled([
        supabase.from('orders').select('*').limit(100),
        supabase.from('profiles').select('*').limit(200),
      ]);

      if (ordersRes.status === 'fulfilled' && !ordersRes.value.error && Array.isArray(ordersRes.value.data)) {
        const unifiedOrders = (ordersRes.value.data as RawRow[]).map((row, idx) => unifyOrder(row, idx));
        unifiedOrders.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
        setOrders(unifiedOrders);
      } else {
        setOrders([]);
      }

      if (profilesRes.status === 'fulfilled' && !profilesRes.value.error && Array.isArray(profilesRes.value.data)) {
        const unifiedProfiles = (profilesRes.value.data as RawRow[]).map((row, idx) => unifyProfile(row, idx));

        setDrivers(unifiedProfiles.filter((p) => ['driver', 'courier', 'delivery'].includes(p.role)));
        setPartners(unifiedProfiles.filter((p) => ['partner', 'merchant', 'store', 'restaurant'].includes(p.role)));
      } else {
        setDrivers([]);
        setPartners([]);
      }
    } catch {
      setErrorMsg('تعذر تحميل بيانات لوحة ودي. تحقق من الاتصال أو سياسات الجداول في Supabase.');
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const persistDriverAssignment = async (orderId: string, driverId: string) => {
    const idColumns = ['id', 'order_id'];
    const payloads: RawRow[] = [
      { driver_id: driverId, status: 'assigned' },
      { driver_id: driverId, order_status: 'assigned' },
      { courier_id: driverId, status: 'assigned' },
      { driver_id: driverId },
    ];

    for (const idCol of idColumns) {
      for (const body of payloads) {
        const res = await supabase.from('orders').update(body).eq(idCol, orderId).select();
        if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
          return true;
        }
      }
    }
    return false;
  };

  const handleAssignDriver = async (order: UnifiedOrder, explicitDriverId?: string) => {
    const chosenDriverId = explicitDriverId || selectedDriverByOrder[order.id];
    if (!order.id || !chosenDriverId) return;

    setBusyId(order.id);
    setNotice(null);
    setErrorMsg(null);

    const saved = await persistDriverAssignment(order.id, chosenDriverId);

    if (saved) {
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id ? { ...item, driverId: chosenDriverId, status: 'assigned' } : item
        )
      );
      setNotice(`تم إسناد الطلب #${order.id.slice(0, 8)} بنجاح.`);
      await loadAllData();
    } else {
      setErrorMsg('لم يتم الحفظ في قاعدة البيانات؛ تحقق من سياسات RLS لجدول orders في Supabase.');
    }

    setBusyId(null);
  };

  const handleAutoDispatch = async (order: UnifiedOrder) => {
    const targetDriver = drivers.find((d) => d.isOnline) || drivers[0];
    if (!targetDriver) {
      setErrorMsg('لا يوجد سائقون متاحون للتوجيه التلقائي حالياً.');
      return;
    }
    await handleAssignDriver(order, targetDriver.id);
  };

  const handleSignOut = async () => {
    localStorage.removeItem('wadi_admin_session');
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const summary = useMemo(() => {
    let totalDeliveryFee = 0;
    let totalDriverCommission = 0;

    for (const ord of orders) {
      totalDeliveryFee += ord.deliveryFee;
      totalDriverCommission += ord.driverCommission;
    }

    return {
      ordersCount: orders.length,
      driversCount: drivers.length,
      partnersCount: partners.length,
      totalDeliveryFee,
      totalDriverCommission,
    };
  }, [orders, drivers, partners]);

  if (loading) {
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
          padding: 24,
        }}
      >
        <p>جاري تحميل لوحة إدارة ودي...</p>
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#0b0f17',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
        padding: '20px',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>لوحة إدارة ودي — Wadi Admin</h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            {adminName} • قاعدة بيانات Wadi 67
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={loadAllData}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            تحديث
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            خروج
          </button>
        </div>
      </header>

      {notice && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: '#064e3b',
            border: '1px solid #10b981',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {notice}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: '#450a0a',
            border: '1px solid #ef4444',
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {errorMsg}
        </div>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>الطلبات</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{summary.ordersCount}</div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>السائقون</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{summary.driversCount}</div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>الشركاء</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{summary.partnersCount}</div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>إجمالي أجور التوصيل</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{formatIQD(summary.totalDeliveryFee)}</div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>عمولة السائقين (25%)</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: '#34d399' }}>
            {formatIQD(summary.totalDriverCommission)}
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>الطلبات والتوجيه</h2>

        {orders.length === 0 ? (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, color: '#94a3b8' }}>
            لا توجد طلبات معروضة حالياً.
          </div>
        ) : (
          orders.map((ord) => {
            const chosenDriver = selectedDriverByOrder[ord.id] ?? ord.driverId;

            return (
              <div
                key={ord.id}
                style={{
                  background: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <strong>طلب #{ord.id.slice(0, 8)} — {ord.customerName}</strong>
                  <span style={{ color: '#38bdf8', fontSize: 13 }}>الحالة: {ord.status}</span>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  المنطقة/العنوان: {ord.area} • التوصيل: {formatIQD(ord.deliveryFee)} • العمولة: {formatIQD(ord.driverCommission)}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={chosenDriver}
                    onChange={(e) =>
                      setSelectedDriverByOrder((prev) => ({ ...prev, [ord.id]: e.target.value }))
                    }
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#0f172a',
                      color: '#fff',
                      minWidth: 160,
                    }}
                  >
                    <option value="">اختر سائقاً...</option>
                    {drivers.map((drv) => (
                      <option key={drv.id} value={drv.id}>
                        {drv.fullName} {drv.isOnline ? '(متاح)' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={busyId === ord.id || !chosenDriver}
                    onClick={() => handleAssignDriver(ord)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      cursor: 'pointer',
                      opacity: busyId === ord.id || !chosenDriver ? 0.6 : 1,
                    }}
                  >
                    توجيه يدوي
                  </button>

                  <button
                    type="button"
                    disabled={busyId === ord.id}
                    onClick={() => handleAutoDispatch(ord)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #10b981',
                      background: 'transparent',
                      color: '#34d399',
                      cursor: 'pointer',
                    }}
                  >
                    توجيه تلقائي
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
