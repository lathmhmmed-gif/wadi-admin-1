'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';

type RawRow = Record<string, unknown>;

export interface UnifiedProfile {
  id: string;
  fullName: string;
  role: string;
  status: string;
  phone: string;
  isOnline: boolean;
  isApproved: boolean;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
}

export interface UnifiedOrder {
  id: string;
  customerName: string;
  partnerName: string;
  area: string;
  status: string;
  driverId: string;
  deliveryFee: number;
  driverCommission: number;
  netAfterDiscount: number;
  createdAt: string;
}

const ADMIN_EMAIL = 'lathmhmmed@gmail.com';
const ADMIN_PASSWORDS = ['wodi2026admin', 'Lathmhmmed12345678_'];
const SETTLEMENT_STORAGE_KEY = 'wadi_driver_settlement_v1';

const COLUMN_ALIASES = {
  id: ['id', 'order_id', 'user_id', 'profile_id', 'uuid'],
  fullName: ['full_name', 'name', 'customer_name', 'client_name', 'recipient_name', 'store_name', 'merchant_name'],
  partnerName: ['partner_name', 'merchant_name', 'store_name', 'restaurant_name', 'shop_name', 'vendor_name'],
  role: ['role', 'user_role', 'account_type', 'type'],
  status: ['status', 'order_status', 'account_status', 'driver_status', 'state'],
  phone: ['phone', 'mobile', 'phone_number', 'tel', 'whatsapp'],
  area: ['area', 'district', 'city', 'region', 'address', 'dropoff_address', 'delivery_address', 'location'],
  driverId: ['driver_id', 'courier_id', 'delivery_id', 'assigned_driver_id'],
  deliveryFee: ['delivery_fee', 'delivery_price', 'shipping_fee', 'fee', 'delivery_cost', 'total_delivery'],
  commission: ['driver_commission', 'commission', 'courier_commission', 'platform_fee'],
  createdAt: ['created_at', 'inserted_at', 'updated_at', 'timestamp', 'date'],
  lat: ['lat', 'latitude', 'current_lat', 'driver_lat'],
  lng: ['lng', 'lon', 'longitude', 'current_lng', 'driver_lng'],
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

function readOptionalCoord(row: RawRow, keys: string[]): number | null {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'number' && !Number.isNaN(val) && val !== 0) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val.trim());
      if (!Number.isNaN(parsed) && parsed !== 0) return parsed;
    }
  }
  return null;
}

function readFirstBoolean(row: RawRow | null | undefined, keys: string[]): boolean | null {
  if (!row) return null;
  for (const key of keys) {
    const val = row[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (['true', 'online', 'available', 'active', 'approved', 'verified', '1', 'yes'].includes(lower)) return true;
      if (['false', 'offline', 'pending', 'suspended', 'blocked', 'inactive', '0', 'no'].includes(lower)) return false;
    }
  }
  return null;
}

function unifyProfile(row: RawRow, index = 0): UnifiedProfile {
  const id = readFirstString(row, COLUMN_ALIASES.id, `profile-${index}`);
  const fullName = readFirstString(row, COLUMN_ALIASES.fullName, `مستخدم ${index + 1}`);
  const role = readFirstString(row, COLUMN_ALIASES.role, 'user').toLowerCase();
  const status = readFirstString(row, COLUMN_ALIASES.status, 'pending').toLowerCase();
  const phone = readFirstString(row, COLUMN_ALIASES.phone, '');

  const onlineBool = readFirstBoolean(row, ['is_online', 'online', 'available', 'is_available']);
  const isOnline = onlineBool ?? ['online', 'available', 'active', 'ready'].includes(status);

  const approvedBool = readFirstBoolean(row, ['is_approved', 'approved', 'is_active', 'is_verified', 'verified']);
  const isApproved =
    approvedBool ??
    !['pending', 'suspended', 'blocked', 'disabled', 'inactive', 'rejected'].includes(status);

  const lat = readOptionalCoord(row, COLUMN_ALIASES.lat);
  const lng = readOptionalCoord(row, COLUMN_ALIASES.lng);
  const locationLabel = readFirstString(row, ['current_location', 'location_name', 'area', 'district', 'address'], '');

  return {
    id,
    fullName,
    role,
    status,
    phone,
    isOnline,
    isApproved,
    lat,
    lng,
    locationLabel,
  };
}

function unifyOrder(row: RawRow, index = 0): UnifiedOrder {
  const id = readFirstString(row, COLUMN_ALIASES.id, `order-${index}`);
  const customerName = readFirstString(row, COLUMN_ALIASES.fullName, 'عميل');
  const partnerName = readFirstString(row, COLUMN_ALIASES.partnerName, 'شريك ودي');
  const area = readFirstString(row, COLUMN_ALIASES.area, 'غير محدد');
  const status = readFirstString(row, COLUMN_ALIASES.status, 'pending').toLowerCase();
  const driverId = readFirstString(row, COLUMN_ALIASES.driverId, '');
  const deliveryFee = readFirstNumber(row, COLUMN_ALIASES.deliveryFee, 0);

  const explicitCommission = readFirstNumber(row, COLUMN_ALIASES.commission, -1);
  const driverCommission = explicitCommission >= 0 ? explicitCommission : deliveryFee * 0.25;
  const netAfterDiscount = Math.max(0, deliveryFee - driverCommission);
  const createdAt = readFirstString(row, COLUMN_ALIASES.createdAt, '');

  return {
    id,
    customerName,
    partnerName,
    area,
    status,
    driverId,
    deliveryFee,
    driverCommission,
    netAfterDiscount,
    createdAt,
  };
}

function formatIQD(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} د.ع`;
}

function formatStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (['pending', 'new', 'waiting'].includes(s)) return 'قيد الانتظار';
  if (['assigned', 'accepted', 'picked_up', 'on_way', 'in_delivery'].includes(s)) return 'مسند / قيد التوصيل';
  if (['delivered', 'completed', 'done'].includes(s)) return 'مكتمل';
  if (['cancelled', 'canceled', 'rejected'].includes(s)) return 'ملغي';
  return status || 'غير محدد';
}

function playStrongOrderAlert() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const notes = [880, 1174.66, 880, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.14);
    });
  } catch {
    // تجاهل أي قيود صوتية قبل التفاعل
  }
}

export default function WadiAdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [adminName, setAdminName] = useState('المدير العام');
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [drivers, setDrivers] = useState<UnifiedProfile[]>([]);
  const [partners, setPartners] = useState<UnifiedProfile[]>([]);
  const [selectedDriverByOrder, setSelectedDriverByOrder] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settledAtByDriver, setSettledAtByDriver] = useState<Record<string, string>>({});

  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(SETTLEMENT_STORAGE_KEY);
      if (saved) setSettledAtByDriver(JSON.parse(saved));
    } catch {
      // تجاهل
    }
  }, []);

  const loadAllData = useCallback(
    async (playSoundOnNewOrders = false) => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const [ordersRes, profilesRes] = await Promise.allSettled([
          supabase.from('orders').select('*').limit(200),
          supabase.from('profiles').select('*').limit(300),
        ]);

        if (ordersRes.status === 'fulfilled' && !ordersRes.value.error && Array.isArray(ordersRes.value.data)) {
          const unifiedOrders = (ordersRes.value.data as RawRow[]).map((row, idx) => unifyOrder(row, idx));
          unifiedOrders.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

          const currentIds = new Set(unifiedOrders.map((o) => o.id));
          if (hasLoadedOnceRef.current && playSoundOnNewOrders && soundEnabled) {
            const hasBrandNew = unifiedOrders.some((o) => !knownOrderIdsRef.current.has(o.id));
            if (hasBrandNew) {
              playStrongOrderAlert();
            }
          }
          knownOrderIdsRef.current = currentIds;
          hasLoadedOnceRef.current = true;
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
    },
    [soundEnabled, supabase]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const localRaw = typeof window !== 'undefined' ? localStorage.getItem('wadi_admin_session') : null;
        const localSession = localRaw ? JSON.parse(localRaw) : null;
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (localSession?.role === 'admin' || user) {
          setAdminName(localSession?.name || user?.email || 'المدير العام');
          setAuthenticated(true);
          setCheckingAuth(false);
          await loadAllData(false);
        } else {
          setAuthenticated(false);
          setCheckingAuth(false);
        }
      } catch {
        if (!active) return;
        setAuthenticated(false);
        setCheckingAuth(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadAllData, supabase]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      void loadAllData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [authenticated, loadAllData]);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setLoginError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      setLoggingIn(false);
      return;
    }

    try {
      if (cleanEmail === ADMIN_EMAIL && ADMIN_PASSWORDS.includes(cleanPass)) {
        localStorage.setItem(
          'wadi_admin_session',
          JSON.stringify({ email: cleanEmail, role: 'admin', name: 'المدير العام' })
        );
        setAdminName('المدير العام');
        setAuthenticated(true);
        setLoggingIn(false);
        await loadAllData(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPass,
      });

      if (error || !data.user) {
        setLoginError('بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور.');
        setLoggingIn(false);
        return;
      }

      localStorage.setItem(
        'wadi_admin_session',
        JSON.stringify({ email: cleanEmail, role: 'admin', name: data.user.email || 'المدير العام' })
      );
      setAdminName(data.user.email || 'المدير العام');
      setAuthenticated(true);
      setLoggingIn(false);
      await loadAllData(false);
    } catch {
      setLoginError('حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.');
      setLoggingIn(false);
    }
  };

  const persistOrderUpdate = async (orderId: string, payloads: RawRow[]) => {
    const idColumns = ['id', 'order_id'];
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

    const targetDriver = drivers.find((d) => d.id === chosenDriverId);
    if (targetDriver && !targetDriver.isApproved) {
      setErrorMsg('لا يمكن إسناد الطلب لهذا السائق لأن حسابه غير مفعّل من قِبل المدير.');
      return;
    }

    setBusyId(order.id);
    setNotice(null);
    setErrorMsg(null);

    const saved = await persistOrderUpdate(order.id, [
      { driver_id: chosenDriverId, status: 'assigned' },
      { driver_id: chosenDriverId, order_status: 'assigned' },
      { courier_id: chosenDriverId, status: 'assigned' },
      { driver_id: chosenDriverId },
    ]);

    if (saved) {
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id ? { ...item, driverId: chosenDriverId, status: 'assigned' } : item
        )
      );
      setNotice(`تم إسناد الطلب #${order.id.slice(0, 8)} بنجاح.`);
      await loadAllData(false);
    } else {
      setErrorMsg('لم يتم الحفظ في قاعدة البيانات؛ تحقق من سياسات RLS لجدول orders في Supabase.');
    }

    setBusyId(null);
  };

  const handleAutoDispatch = async (order: UnifiedOrder) => {
    const targetDriver = drivers.find((d) => d.isApproved && d.isOnline) || drivers.find((d) => d.isApproved);
    if (!targetDriver) {
      setErrorMsg('لا يوجد سائقون مفعّلون من قِبل المدير للتوجيه التلقائي حالياً.');
      return;
    }
    await handleAssignDriver(order, targetDriver.id);
  };

  const handleStatusChange = async (order: UnifiedOrder, nextStatus: string) => {
    if (!order.id || !nextStatus) return;

    setBusyId(order.id);
    setNotice(null);
    setErrorMsg(null);

    const saved = await persistOrderUpdate(order.id, [{ status: nextStatus }, { order_status: nextStatus }]);

    if (saved) {
      setOrders((prev) =>
        prev.map((item) => (item.id === order.id ? { ...item, status: nextStatus } : item))
      );
      setNotice(`تم تحديث حالة الطلب #${order.id.slice(0, 8)} إلى (${formatStatusLabel(nextStatus)}).`);
      await loadAllData(false);
    } else {
      setErrorMsg('تعذر تحديث حالة الطلب في قاعدة البيانات.');
    }

    setBusyId(null);
  };

  const handleToggleUserApproval = async (userProfile: UnifiedProfile) => {
    const nextApproved = !userProfile.isApproved;
    setBusyId(userProfile.id);
    setNotice(null);
    setErrorMsg(null);

    const idCols = ['id', 'user_id', 'profile_id'];
    const payloads: RawRow[] = nextApproved
      ? [
          { is_approved: true, status: 'active' },
          { approved: true, status: 'active' },
          { is_active: true, status: 'active' },
          { status: 'active' },
        ]
      : [
          { is_approved: false, status: 'pending' },
          { approved: false, status: 'pending' },
          { is_active: false, status: 'pending' },
          { status: 'pending' },
        ];

    let saved = false;
    for (const col of idCols) {
      for (const body of payloads) {
        const res = await supabase.from('profiles').update(body).eq(col, userProfile.id).select();
        if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
          saved = true;
          break;
        }
      }
      if (saved) break;
    }

    if (saved) {
      setNotice(
        nextApproved
          ? `تم تفعيل حساب (${userProfile.fullName}) بواسطة المدير.`
          : `تم إيقاف/تعليق حساب (${userProfile.fullName}) بواسطة المدير.`
      );
      await loadAllData(false);
    } else {
      setErrorMsg('تعذر تحديث حالة التفعيل في جدول profiles؛ تحقق من سياسات RLS في Supabase.');
    }

    setBusyId(null);
  };

  const handleResetDriverAccount = (drv: UnifiedProfile) => {
    const nowIso = new Date().toISOString();
    const updated = { ...settledAtByDriver, [drv.id]: nowIso };
    setSettledAtByDriver(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTLEMENT_STORAGE_KEY, JSON.stringify(updated));
    }
    setNotice(`تم تصفير حساب المندوب (${drv.fullName}) لبدء دورة محاسبة جديدة.`);
  };

  const handleSignOut = async () => {
    localStorage.removeItem('wadi_admin_session');
    await supabase.auth.signOut();
    setAuthenticated(false);
  };

  const driverNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of drivers) {
      map[d.id] = d.fullName;
    }
    return map;
  }, [drivers]);

  const driverAccounting = useMemo(() => {
    const map: Record<
      string,
      {
        ordersCount: number;
        totalFeeBeforeDiscount: number;
        totalDiscount25: number;
        totalFeeAfterDiscount: number;
      }
    > = {};

    for (const d of drivers) {
      map[d.id] = {
        ordersCount: 0,
        totalFeeBeforeDiscount: 0,
        totalDiscount25: 0,
        totalFeeAfterDiscount: 0,
      };
    }

    for (const ord of orders) {
      if (!ord.driverId) continue;
      const settledAt = settledAtByDriver[ord.driverId];
      if (settledAt && ord.createdAt && Date.parse(ord.createdAt) <= Date.parse(settledAt)) {
        continue;
      }

      if (!map[ord.driverId]) {
        map[ord.driverId] = {
          ordersCount: 0,
          totalFeeBeforeDiscount: 0,
          totalDiscount25: 0,
          totalFeeAfterDiscount: 0,
        };
      }

      const discount25 = ord.deliveryFee * 0.25;
      const afterDiscount = Math.max(0, ord.deliveryFee - discount25);

      map[ord.driverId].ordersCount += 1;
      map[ord.driverId].totalFeeBeforeDiscount += ord.deliveryFee;
      map[ord.driverId].totalDiscount25 += discount25;
      map[ord.driverId].totalFeeAfterDiscount += afterDiscount;
    }

    return map;
  }, [drivers, orders, settledAtByDriver]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((ord) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'pending' && ['pending', 'new', 'waiting'].includes(ord.status)) ||
        (statusFilter === 'assigned' && ['assigned', 'accepted', 'picked_up', 'on_way', 'in_delivery'].includes(ord.status)) ||
        (statusFilter === 'delivered' && ['delivered', 'completed', 'done'].includes(ord.status)) ||
        (statusFilter === 'cancelled' && ['cancelled', 'canceled', 'rejected'].includes(ord.status));

      const matchesQuery =
        !q ||
        ord.id.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        ord.partnerName.toLowerCase().includes(q) ||
        ord.area.toLowerCase().includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [orders, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    let totalDeliveryFee = 0;
    let totalDiscount25 = 0;
    let totalAfterDiscount = 0;
    let activeDrivers = 0;

    for (const ord of orders) {
      const d25 = ord.deliveryFee * 0.25;
      totalDeliveryFee += ord.deliveryFee;
      totalDiscount25 += d25;
      totalAfterDiscount += Math.max(0, ord.deliveryFee - d25);
    }

    for (const drv of drivers) {
      if (drv.isApproved && drv.isOnline) activeDrivers += 1;
    }

    return {
      ordersCount: orders.length,
      driversCount: drivers.length,
      activeDrivers,
      partnersCount: partners.length,
      totalDeliveryFee,
      totalDiscount25,
      totalAfterDiscount,
    };
  }, [orders, drivers, partners]);

  if (checkingAuth) {
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

  if (!authenticated) {
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
          onSubmit={handleLoginSubmit}
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

          {loginError && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: '#450a0a',
                border: '1px solid #ef4444',
                fontSize: 13,
              }}
            >
              {loginError}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            البريد الإلكتروني
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            disabled={loggingIn}
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
            {loggingIn ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
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
            {adminName} • التفعيل حصري للمدير • قاعدة بيانات Wadi 67
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              playStrongOrderAlert();
            }}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #f59e0b',
              background: '#451a03',
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            اختبار صوت الطلبات
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            style={{
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#111827',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {soundEnabled ? 'الصوت: مفعّل' : 'الصوت: مكتوم'}
          </button>

          <button
            type="button"
            onClick={() => void loadAllData(false)}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            تحديث
          </button>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            style={{
              padding: '9px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
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

      {/* ملخص عام */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>إجمالي الطلبات</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
            {loading ? '...' : summary.ordersCount}
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>السائقون (المتاحون)</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
            {loading ? '...' : `${summary.driversCount} (${summary.activeDrivers})`}
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>الشركاء</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
            {loading ? '...' : summary.partnersCount}
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>التوصيل قبل خصم 25%</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>
            {formatIQD(summary.totalDeliveryFee)}
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>التوصيل بعد خصم 25%</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color: '#34d399' }}>
            {formatIQD(summary.totalAfterDiscount)}
          </div>
        </div>
      </section>

      {/* الطلبات والتوجيه */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>الطلبات والتوجيه ({filteredOrders.length})</h2>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالرقم، الشريك، العميل، أو المنطقة..."
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#111827',
                color: '#fff',
                minWidth: 220,
                fontSize: 13,
              }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#111827',
                color: '#fff',
                fontSize: 13,
              }}
            >
              <option value="all">كل الحالات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="assigned">مسند / قيد التوصيل</option>
              <option value="delivered">مكتمل</option>
              <option value="cancelled">ملغي</option>
            </select>
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 20, color: '#94a3b8' }}>
            لا توجد طلبات مطابقة للبحث أو الفلتر الحالي.
          </div>
        ) : (
          filteredOrders.map((ord) => {
            const chosenDriver = selectedDriverByOrder[ord.id] ?? ord.driverId;
            const assignedDriverName = ord.driverId
              ? driverNameById[ord.driverId] || `سائق (${ord.driverId.slice(0, 6)})`
              : 'غير مسند';

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
                  <strong>
                    طلب #{ord.id.slice(0, 8)} — الشريك: {ord.partnerName}
                  </strong>
                  <span style={{ color: '#38bdf8', fontSize: 13 }}>
                    الحالة: {formatStatusLabel(ord.status)} • السائق: {assignedDriverName}
                  </span>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                  العميل: {ord.customerName} • المنطقة: {ord.area}
                </div>

                <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>
                  سعر التوصيل من الشريك: {formatIQD(ord.deliveryFee)} • خصم 25%: {formatIQD(ord.driverCommission)} • الصافي بعد الخصم: {formatIQD(ord.netAfterDiscount)}
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
                      minWidth: 170,
                    }}
                  >
                    <option value="">اختر سائقاً مفعّلاً...</option>
                    {drivers.map((drv) => (
                      <option key={drv.id} value={drv.id} disabled={!drv.isApproved}>
                        {drv.fullName} {!drv.isApproved ? '(غير مفعّل)' : drv.isOnline ? '(متاح)' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={busyId === ord.id || !chosenDriver}
                    onClick={() => void handleAssignDriver(ord)}
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
                    onClick={() => void handleAutoDispatch(ord)}
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

                  <select
                    aria-label="تغيير حالة الطلب"
                    disabled={busyId === ord.id}
                    value={ord.status}
                    onChange={(e) => void handleStatusChange(ord, e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#0f172a',
                      color: '#e2e8f0',
                      fontSize: 13,
                    }}
                  >
                    <option value="pending">قيد الانتظار</option>
                    <option value="assigned">مسند / قيد التوصيل</option>
                    <option value="delivered">مكتمل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* السائقون: التفعيل، التتبع، الحساب، وتصفير الحساب */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>السائقون والتتبع والمحاسبة ({drivers.length})</h2>
        {drivers.length === 0 ? (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16, color: '#94a3b8' }}>
            لا يوجد سائقون مسجلون حالياً.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
            {drivers.map((drv) => {
              const acc = driverAccounting[drv.id] || {
                ordersCount: 0,
                totalFeeBeforeDiscount: 0,
                totalDiscount25: 0,
                totalFeeAfterDiscount: 0,
              };

              const hasCoords = drv.lat !== null && drv.lng !== null;
              const mapUrl = hasCoords
                ? `https://www.google.com/maps?q=${drv.lat},${drv.lng}`
                : drv.locationLabel
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(drv.locationLabel)}`
                  : null;

              return (
                <div
                  key={drv.id}
                  style={{
                    background: '#111827',
                    border: '1px solid #1f2937',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong>{drv.fullName}</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: drv.isApproved ? '#064e3b' : '#450a0a',
                          color: drv.isApproved ? '#34d399' : '#fca5a5',
                        }}
                      >
                        {drv.isApproved ? 'مفعّل' : 'بانتظار تفعيل المدير'}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: drv.isOnline ? '#172554' : '#1e293b',
                          color: drv.isOnline ? '#60a5fa' : '#94a3b8',
                        }}
                      >
                        {drv.isOnline ? 'متصل' : 'غير متصل'}
                      </span>
                    </div>
                  </div>

                  <div style={{ color: '#cbd5e1', fontSize: 13 }}>الهاتف: {drv.phone || 'غير متوفر'}</div>

                  <div style={{ color: '#cbd5e1', fontSize: 13 }}>
                    التتبع: {hasCoords ? `${drv.lat}, ${drv.lng}` : drv.locationLabel || 'لا يوجد موقع مباشر مسجل'}
                    {mapUrl && (
                      <>
                        {' — '}
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#38bdf8', textDecoration: 'underline' }}
                        >
                          فتح التتبع على الخريطة
                        </a>
                      </>
                    )}
                  </div>

                  <div style={{ color: '#e2e8f0', fontSize: 13, background: '#0f172a', padding: 10, borderRadius: 8 }}>
                    <div>عدد الطلبات: <strong>{acc.ordersCount}</strong></div>
                    <div>مجموع سعر التوصيل قبل الخصم: <strong>{formatIQD(acc.totalFeeBeforeDiscount)}</strong></div>
                    <div>خصم 25%: <strong>{formatIQD(acc.totalDiscount25)}</strong></div>
                    <div style={{ color: '#34d399' }}>
                      الإجمالي بعد خصم 25%: <strong>{formatIQD(acc.totalFeeAfterDiscount)}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <button
                      type="button"
                      disabled={busyId === drv.id}
                      onClick={() => void handleToggleUserApproval(drv)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: drv.isApproved ? '#b91c1c' : '#15803d',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {drv.isApproved ? 'إيقاف الحساب' : 'تفعيل السائق (بواسطة المدير)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResetDriverAccount(drv)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #f59e0b',
                        background: 'transparent',
                        color: '#fbbf24',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      تصفير الحساب
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* الشركاء وتفعيل حساباتهم */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>الشركاء وتفعيل الحسابات ({partners.length})</h2>
        {partners.length === 0 ? (
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 16, color: '#94a3b8' }}>
            لا يوجد شركاء مسجلون حالياً.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {partners.map((prt) => (
              <div
                key={prt.id}
                style={{
                  background: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{prt.fullName}</strong>
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: prt.isApproved ? '#064e3b' : '#450a0a',
                      color: prt.isApproved ? '#34d399' : '#fca5a5',
                    }}
                  >
                    {prt.isApproved ? 'مفعّل' : 'بانتظار تفعيل المدير'}
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 13 }}>الهاتف: {prt.phone || 'غير متوفر'}</div>
                <button
                  type="button"
                  disabled={busyId === prt.id}
                  onClick={() => void handleToggleUserApproval(prt)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: prt.isApproved ? '#b91c1c' : '#2563eb',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    alignSelf: 'flex-start',
                  }}
                >
                  {prt.isApproved ? 'إيقاف الشريك' : 'تفعيل الشريك (بواسطة المدير)'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
