'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import WadiPricingAndPartnersAdmin from '@/WadiPricingAndPartnersAdmin';

type RawRow = Record<string, unknown>;

type NavTab =
  | 'orders'
  | 'delivery_prices'
  | 'partners_km'
  | 'approvals'
  | 'restaurants'
  | 'stores'
  | 'markets'
  | 'pages'
  | 'drivers'
  | 'admins'
  | 'stats'
  | 'settings';

type PartnerCategory = 'restaurants' | 'stores' | 'markets' | 'pages';
type SoundStyle = 'siren' | 'chime' | 'double_beep' | 'urgent_bell';
type ThemeBrightness = 'dark' | 'midnight' | 'light';

export interface DeliveryZonePrice {
  id: string;
  areaName: string;
  priceIqd: number;
  active: boolean;
}

export interface UnifiedProfile {
  id: string;
  sourceTable: 'partners' | 'profiles';
  fullName: string;
  username: string;
  role: string;
  partnerCategory: PartnerCategory;
  status: string;
  phone: string;
  address: string;
  avatarUrl: string;
  isOnline: boolean;
  isApproved: boolean;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
  createdAt: string;
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

export interface SubAdminAccount {
  id: string;
  name: string;
  username: string;
  password: string;
  facePhotoBase64: string;
  active: boolean;
  createdAt: string;
}

const SUPER_ADMIN_EMAIL = 'lathmhmmed@gmail.com';
const SUPER_ADMIN_PASSWORDS = ['wodi2026admin', 'Lathmhmmed12345678_'];

const SESSION_KEY = 'wadi_admin_session_v2';
const SETTLEMENT_KEY = 'wadi_driver_settlement_v1';
const SUB_ADMINS_KEY = 'wadi_sub_admins_v1';
const SETTINGS_KEY = 'wadi_admin_settings_v1';
const ZONES_STORAGE_KEY = 'wadi_delivery_zones_v1';
const NOTIFIED_ORDERS_KEY = 'wadi_notified_order_ids_v1';

const COLUMN_ALIASES = {
  id: ['id', 'order_id', 'user_id', 'profile_id', 'partner_id', 'uuid'],
  fullName: [
    'business_name',
    'project_name',
    'full_name',
    'name',
    'customer_name',
    'client_name',
    'recipient_name',
    'store_name',
    'merchant_name',
  ],
  username: ['username', 'user_name', 'handle', 'login', 'email'],
  partnerName: [
    'business_name',
    'project_name',
    'partner_name',
    'merchant_name',
    'store_name',
    'restaurant_name',
    'shop_name',
    'vendor_name',
  ],
  role: ['role', 'user_role', 'account_type', 'type'],
  category: ['category', 'business_type', 'store_type', 'partner_type', 'sector', 'specialty', 'section'],
  status: ['status', 'order_status', 'account_status', 'driver_status', 'state'],
  phone: ['phone', 'mobile', 'phone_number', 'tel', 'whatsapp'],
  address: ['address', 'area', 'district', 'city', 'region', 'location', 'customer_zone'],
  avatar: ['avatar_url', 'photo_url', 'image_url', 'profile_image', 'picture', 'photo', 'avatar'],
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

function isDriverAccount(rawRole: string, rawCategory: string): boolean {
  const combined = `${rawRole} ${rawCategory}`.toLowerCase();
  return (
    combined.includes('driver') ||
    combined.includes('courier') ||
    combined.includes('delivery') ||
    combined.includes('مندوب') ||
    combined.includes('سائق') ||
    combined.includes('توصيل')
  );
}

function detectPartnerCategory(rawCategory: string, name: string): PartnerCategory {
  const combined = `${rawCategory} ${name}`.toLowerCase();
  if (
    combined.includes('مطعم') ||
    combined.includes('مطاعم') ||
    combined.includes('restaurant') ||
    combined.includes('restaurants') ||
    combined.includes('food') ||
    combined.includes('cafe') ||
    combined.includes('كافيه') ||
    combined.includes('برغر') ||
    combined.includes('بيتزا') ||
    combined.includes('شاورما') ||
    combined.includes('مشاوي') ||
    combined.includes('معجنات')
  ) {
    return 'restaurants';
  }
  if (
    combined.includes('اسواق') ||
    combined.includes('أسواق') ||
    combined.includes('سوبر') ||
    combined.includes('ماركت') ||
    combined.includes('market') ||
    combined.includes('markets') ||
    combined.includes('grocery') ||
    combined.includes('بقالة')
  ) {
    return 'markets';
  }
  if (
    combined.includes('بيج') ||
    combined.includes('بيجات') ||
    combined.includes('page') ||
    combined.includes('pages') ||
    combined.includes('انستا') ||
    combined.includes('تيك') ||
    combined.includes('social') ||
    combined.includes('online')
  ) {
    return 'pages';
  }
  return 'stores';
}

function unifyProfile(
  row: RawRow,
  index = 0,
  sourceTable: 'partners' | 'profiles' = 'profiles'
): UnifiedProfile {
  const id = readFirstString(row, COLUMN_ALIASES.id, `${sourceTable}-${index}`);
  const fullName = readFirstString(row, COLUMN_ALIASES.fullName, `حساب ${index + 1}`);
  const username = readFirstString(row, COLUMN_ALIASES.username, `@user_${id.slice(0, 5)}`);
  const rawRole = readFirstString(
    row,
    COLUMN_ALIASES.role,
    sourceTable === 'partners' ? 'partner' : 'partner'
  ).toLowerCase();
  const rawCat = readFirstString(row, COLUMN_ALIASES.category, '');
  const role = isDriverAccount(rawRole, rawCat) ? 'driver' : rawRole || 'partner';
  const partnerCategory = detectPartnerCategory(rawCat, fullName);
  const status = readFirstString(row, COLUMN_ALIASES.status, 'pending').toLowerCase();
  const phone = readFirstString(row, COLUMN_ALIASES.phone, '');
  const address = readFirstString(row, COLUMN_ALIASES.address, 'غير محدد');
  const avatarUrl = readFirstString(row, COLUMN_ALIASES.avatar, '');

  const onlineBool = readFirstBoolean(row, ['is_online', 'online', 'available', 'is_available']);
  const isOnline = onlineBool ?? ['online', 'available', 'active', 'ready'].includes(status);

  const approvedBool = readFirstBoolean(row, ['is_approved', 'approved', 'is_active', 'is_verified', 'verified']);
  const isApproved =
    approvedBool ??
    !['pending', 'unapproved', 'waiting', 'suspended', 'blocked', 'disabled', 'inactive', 'rejected'].includes(status);

  const lat = readOptionalCoord(row, COLUMN_ALIASES.lat);
  const lng = readOptionalCoord(row, COLUMN_ALIASES.lng);
  const locationLabel = readFirstString(row, ['current_location', 'location_name', 'area', 'district', 'address'], '');
  const createdAt = readFirstString(row, COLUMN_ALIASES.createdAt, '');

  return {
    id,
    sourceTable,
    fullName,
    username,
    role,
    partnerCategory,
    status,
    phone,
    address,
    avatarUrl,
    isOnline,
    isApproved,
    lat,
    lng,
    locationLabel,
    createdAt,
  };
}

function unifyOrder(row: RawRow, index = 0, zones: DeliveryZonePrice[] = []): UnifiedOrder {
  const id = readFirstString(row, COLUMN_ALIASES.id, `order-${index}`);
  const customerName = readFirstString(row, COLUMN_ALIASES.fullName, 'عميل');
  const partnerName = readFirstString(row, COLUMN_ALIASES.partnerName, 'شريك ودي');
  const area = readFirstString(row, COLUMN_ALIASES.address, 'غير محدد');
  const status = readFirstString(row, COLUMN_ALIASES.status, 'pending').toLowerCase();
  const driverId = readFirstString(row, COLUMN_ALIASES.driverId, '');

  let deliveryFee = readFirstNumber(row, COLUMN_ALIASES.deliveryFee, 0);
  if (deliveryFee <= 0 && area && zones.length > 0) {
    const cleanArea = area.trim().toLowerCase();
    const matchedZone = zones.find(
      (z) =>
        z.active &&
        (cleanArea.includes(z.areaName.trim().toLowerCase()) ||
          z.areaName.trim().toLowerCase().includes(cleanArea))
    );
    if (matchedZone) {
      deliveryFee = matchedZone.priceIqd;
    }
  }

  const explicitCommission = readFirstNumber(row, COLUMN_ALIASES.commission, -1);
  const driverCommission = explicitCommission >= 0 ? explicitCommission : deliveryFee * 0.25;
  const netAfterDiscount = Math.max(0, deliveryFee - driverCommission);
  const createdAt = readFirstString(row, COLUMN_ALIASES.createdAt, new Date().toISOString());

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

function playNotificationTone(style: SoundStyle, repeatCount = 1) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const patterns: Record<SoundStyle, { freqs: number[]; type: OscillatorType; step: number }> = {
      siren: { freqs: [880, 1174.66, 880, 1318.51, 1567.98], type: 'sawtooth', step: 0.13 },
      chime: { freqs: [587.33, 880, 1174.66], type: 'sine', step: 0.18 },
      double_beep: { freqs: [1046.5, 1046.5, 1396.91, 1396.91], type: 'square', step: 0.11 },
      urgent_bell: { freqs: [1318.51, 1567.98, 1318.51, 1567.98, 1760], type: 'triangle', step: 0.1 },
    };

    const chosen = patterns[style] || patterns.siren;
    const clampedRepeats = Math.max(1, Math.min(3, repeatCount));
    let cursor = ctx.currentTime + 0.02;

    for (let r = 0; r < clampedRepeats; r += 1) {
      chosen.freqs.forEach((freq, idx) => {
        const startAt = cursor + idx * chosen.step;
        const endAt = startAt + chosen.step;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = chosen.type;
        osc.frequency.setValueAtTime(freq, startAt);

        gain.gain.setValueAtTime(0.001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.45, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, endAt);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startAt);
        osc.stop(endAt + 0.01);
      });
      cursor += chosen.freqs.length * chosen.step + 0.14;
    }
  } catch {
    // تجاهل قيود التشغيل التلقائي
  }
}

export default function WadiAdminEnterpriseDashboard() {
  const supabase = useMemo(() => createClient(), []);

  // المصادقة والأمان البيومتري للوجه
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [adminRole, setAdminRole] = useState<'super' | 'sub'>('super');
  const [adminName, setAdminName] = useState('المدير العام');
  const [adminAvatar, setAdminAvatar] = useState<string>('');

  const [loginIdentifier, setLoginIdentifier] = useState(SUPER_ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // مرحلة التحقق من الوجه للمدراء الفرعيين
  const [pendingFaceAdmin, setPendingFaceAdmin] = useState<SubAdminAccount | null>(null);
  const [capturedSelfie, setCapturedSelfie] = useState<string>('');
  const [cameraActive, setCameraActive] = useState(false);
  const [faceError, setFaceError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // القائمة الجانبية والأقسام
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('orders');

  // بيانات النظام
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [drivers, setDrivers] = useState<UnifiedProfile[]>([]);
  const [partners, setPartners] = useState<UnifiedProfile[]>([]);
  const [selectedDriverByOrder, setSelectedDriverByOrder] = useState<Record<string, string>>({});

  // أسعار التوصيل حسب المنطقة
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZonePrice[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZonePrice, setNewZonePrice] = useState('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZonePriceValue, setEditingZonePriceValue] = useState('');
  const [zoneSearch, setZoneSearch] = useState('');

  // البحث والفلترة
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // التصفير والمدراء والإعدادات
  const [settledAtByDriver, setSettledAtByDriver] = useState<Record<string, string>>({});
  const [subAdmins, setSubAdmins] = useState<SubAdminAccount[]>([]);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminPhoto, setNewAdminPhoto] = useState('');

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundStyle, setSoundStyle] = useState<SoundStyle>('siren');
  const [themeBrightness, setThemeBrightness] = useState<ThemeBrightness>('dark');
  const [visualBannerAlerts, setVisualBannerAlerts] = useState(true);

  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());
  const hasSeededInitialOrdersRef = useRef<boolean>(false);

  // إخفاء شريط الإشعار الأخضر تلقائياً بعد 4 ثوانٍ
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // تحميل الإعدادات والمدراء وأسعار المناطق المحلية
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedSettle = localStorage.getItem(SETTLEMENT_KEY);
      if (savedSettle) setSettledAtByDriver(JSON.parse(savedSettle));

      const savedAdmins = localStorage.getItem(SUB_ADMINS_KEY);
      if (savedAdmins) setSubAdmins(JSON.parse(savedAdmins));

      const savedZones = localStorage.getItem(ZONES_STORAGE_KEY);
      if (savedZones) setDeliveryZones(JSON.parse(savedZones));

      const savedNotified = localStorage.getItem(NOTIFIED_ORDERS_KEY);
      if (savedNotified) {
        const arr = JSON.parse(savedNotified);
        if (Array.isArray(arr)) {
          notifiedOrderIdsRef.current = new Set(arr.map(String));
        }
      }

      const savedSettings = localStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.soundEnabled === 'boolean') setSoundEnabled(parsed.soundEnabled);
        if (parsed.soundStyle) setSoundStyle(parsed.soundStyle);
        if (parsed.themeBrightness) setThemeBrightness(parsed.themeBrightness);
        if (typeof parsed.visualBannerAlerts === 'boolean') setVisualBannerAlerts(parsed.visualBannerAlerts);
      }
    } catch {
      // تجاهل
    }
  }, []);

  const persistLocalZones = useCallback((zones: DeliveryZonePrice[]) => {
    setDeliveryZones(zones);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
    }
  }, []);

  const saveSettings = useCallback(
    (next: {
      soundEnabled?: boolean;
      soundStyle?: SoundStyle;
      themeBrightness?: ThemeBrightness;
      visualBannerAlerts?: boolean;
    }) => {
      const merged = {
        soundEnabled: next.soundEnabled ?? soundEnabled,
        soundStyle: next.soundStyle ?? soundStyle,
        themeBrightness: next.themeBrightness ?? themeBrightness,
        visualBannerAlerts: next.visualBannerAlerts ?? visualBannerAlerts,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      }
    },
    [soundEnabled, soundStyle, themeBrightness, visualBannerAlerts]
  );

  const triggerOrderAlert = useCallback(
    (orderItem: UnifiedOrder) => {
      if (soundEnabled) {
        playNotificationTone(soundStyle, 2);
      }
      if (visualBannerAlerts) {
        setNotice(
          `طلب جديد من الشريك (${orderItem.partnerName}) — رقم #${orderItem.id.slice(0, 8)} (${formatIQD(orderItem.deliveryFee)})`
        );
      }
    },
    [soundEnabled, soundStyle, visualBannerAlerts]
  );

  const loadAllData = useCallback(
    async (playSoundOnNew = false) => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const [ordersRes, profilesRes, partnersRes, zonesRes] = await Promise.allSettled([
          supabase.from('orders').select('*').limit(250),
          supabase.from('profiles').select('*').limit(400),
          supabase.from('partners').select('*').limit(400),
          supabase.from('delivery_zones').select('*').limit(300),
        ]);

        let activeZones: DeliveryZonePrice[] = deliveryZones;
        if (zonesRes.status === 'fulfilled' && !zonesRes.value.error && Array.isArray(zonesRes.value.data)) {
          const remoteZones: DeliveryZonePrice[] = (zonesRes.value.data as RawRow[]).map((row, idx) => ({
            id: readFirstString(row, ['id', 'zone_id'], `zone-${idx}`),
            areaName: readFirstString(row, ['area_name', 'name', 'area', 'zone_name', 'region'], `منطقة ${idx + 1}`),
            priceIqd: readFirstNumber(row, ['price_iqd', 'price', 'delivery_fee', 'delivery_price', 'fee'], 0),
            active: readFirstBoolean(row, ['is_active', 'active']) ?? true,
          }));
          if (remoteZones.length > 0) {
            activeZones = remoteZones;
            persistLocalZones(remoteZones);
          }
        }

        if (ordersRes.status === 'fulfilled' && !ordersRes.value.error && Array.isArray(ordersRes.value.data)) {
          const unifiedOrders = (ordersRes.value.data as RawRow[]).map((row, idx) =>
            unifyOrder(row, idx, activeZones)
          );
          unifiedOrders.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

          if (!hasSeededInitialOrdersRef.current) {
            unifiedOrders.forEach((o) => notifiedOrderIdsRef.current.add(o.id));
            hasSeededInitialOrdersRef.current = true;
            if (typeof window !== 'undefined') {
              localStorage.setItem(
                NOTIFIED_ORDERS_KEY,
                JSON.stringify(Array.from(notifiedOrderIdsRef.current).slice(-500))
              );
            }
          } else if (playSoundOnNew) {
            const unnotifiedOrders = unifiedOrders.filter((o) => !notifiedOrderIdsRef.current.has(o.id));
            if (unnotifiedOrders.length > 0) {
              unnotifiedOrders.forEach((o) => notifiedOrderIdsRef.current.add(o.id));
              if (typeof window !== 'undefined') {
                localStorage.setItem(
                  NOTIFIED_ORDERS_KEY,
                  JSON.stringify(Array.from(notifiedOrderIdsRef.current).slice(-500))
                );
              }
              const latestOrder = unnotifiedOrders[0];
              if (soundEnabled) {
                playNotificationTone(soundStyle, Math.min(3, unnotifiedOrders.length + 1));
              }
              if (visualBannerAlerts) {
                setNotice(
                  unnotifiedOrders.length === 1
                    ? `طلب جديد من الشريك (${latestOrder.partnerName}) — رقم #${latestOrder.id.slice(0, 8)}`
                    : `وصل (${unnotifiedOrders.length}) طلبات جديدة من الشركاء — أحدثها من (${latestOrder.partnerName})`
                );
              }
            }
          }

          setOrders(unifiedOrders);
        } else {
          setOrders([]);
        }

        const mergedDrivers: UnifiedProfile[] = [];
        const mergedPartners: UnifiedProfile[] = [];
        const seenDriverKeys = new Set<string>();
        const seenPartnerKeys = new Set<string>();

        const pushUnifiedAccount = (acc: UnifiedProfile) => {
          const dedupeKey = `${acc.id}::${acc.fullName.toLowerCase()}::${acc.username.toLowerCase()}`;
          if (acc.role === 'driver') {
            if (!seenDriverKeys.has(dedupeKey)) {
              seenDriverKeys.add(dedupeKey);
              mergedDrivers.push(acc);
            }
          } else if (!seenPartnerKeys.has(dedupeKey)) {
            seenPartnerKeys.add(dedupeKey);
            mergedPartners.push(acc);
          }
        };

        if (partnersRes.status === 'fulfilled' && !partnersRes.value.error && Array.isArray(partnersRes.value.data)) {
          (partnersRes.value.data as RawRow[]).forEach((row, idx) => {
            pushUnifiedAccount(unifyProfile(row, idx, 'partners'));
          });
        }

        if (profilesRes.status === 'fulfilled' && !profilesRes.value.error && Array.isArray(profilesRes.value.data)) {
          (profilesRes.value.data as RawRow[]).forEach((row, idx) => {
            pushUnifiedAccount(unifyProfile(row, idx, 'profiles'));
          });
        }

        setDrivers(mergedDrivers);
        setPartners(mergedPartners);
      } catch {
        setErrorMsg('تعذر تحميل بيانات لوحة ودي. تحقق من الاتصال بقاعدة البيانات.');
      } finally {
        setLoading(false);
      }
    },
    [deliveryZones, persistLocalZones, soundEnabled, soundStyle, supabase, visualBannerAlerts]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
        const session = raw ? JSON.parse(raw) : null;
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (session?.authenticated || user) {
          setAdminName(session?.name || user?.email || 'المدير العام');
          setAdminRole(session?.role === 'sub' ? 'sub' : 'super');
          setAdminAvatar(session?.avatar || '');
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
    const timer = setInterval(() => {
      void loadAllData(true);
    }, 10000);

    const channel = supabase
      .channel('wadi-admin-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const insertedRow = (payload.new || {}) as RawRow;
        const unified = unifyOrder(insertedRow, 0, deliveryZones);
        if (!notifiedOrderIdsRef.current.has(unified.id)) {
          notifiedOrderIdsRef.current.add(unified.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem(
              NOTIFIED_ORDERS_KEY,
              JSON.stringify(Array.from(notifiedOrderIdsRef.current).slice(-500))
            );
          }
          triggerOrderAlert(unified);
        }
        void loadAllData(false);
      })
      .subscribe();

    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [authenticated, deliveryZones, loadAllData, supabase, triggerOrderAlert]);

  // إضافة / تعديل / حذف أسعار التوصيل للمناطق
  const handleAddDeliveryZone = async (e: FormEvent) => {
    e.preventDefault();
    const cleanArea = newZoneName.trim();
    const cleanPrice = Number(newZonePrice);

    if (!cleanArea || Number.isNaN(cleanPrice) || cleanPrice < 0) {
      setErrorMsg('يرجى إدخال اسم المنطقة وسعر التوصيل بالدينار العراقي بشكل صحيح.');
      return;
    }

    setBusyId('add-zone');
    setNotice(null);
    setErrorMsg(null);

    let createdId = `zone-${Date.now()}`;
    const insertRes = await supabase
      .from('delivery_zones')
      .insert([{ area_name: cleanArea, price_iqd: cleanPrice, is_active: true }])
      .select();

    if (!insertRes.error && Array.isArray(insertRes.data) && insertRes.data.length > 0) {
      const row = insertRes.data[0] as RawRow;
      createdId = readFirstString(row, ['id', 'zone_id'], createdId);
    }

    const updatedZones = [
      { id: createdId, areaName: cleanArea, priceIqd: cleanPrice, active: true },
      ...deliveryZones.filter((z) => z.areaName.trim().toLowerCase() !== cleanArea.toLowerCase()),
    ];
    persistLocalZones(updatedZones);
    setNewZoneName('');
    setNewZonePrice('');
    setNotice(`تم حفظ سعر توصيل منطقة (${cleanArea}) بقيمة ${formatIQD(cleanPrice)}.`);
    setBusyId(null);
  };

  const handleSaveEditedZonePrice = async (zone: DeliveryZonePrice) => {
    const parsedPrice = Number(editingZonePriceValue);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMsg('يرجى إدخال سعر صحيح.');
      return;
    }

    setBusyId(zone.id);
    setNotice(null);
    setErrorMsg(null);

    await supabase
      .from('delivery_zones')
      .update({ price_iqd: parsedPrice })
      .eq('id', zone.id);

    const updated = deliveryZones.map((z) =>
      z.id === zone.id ? { ...z, priceIqd: parsedPrice } : z
    );
    persistLocalZones(updated);
    setEditingZoneId(null);
    setEditingZonePriceValue('');
    setNotice(`تم تحديث سعر توصيل (${zone.areaName}) إلى ${formatIQD(parsedPrice)}.`);
    setBusyId(null);
  };

  const handleDeleteDeliveryZone = async (zone: DeliveryZonePrice) => {
    setBusyId(zone.id);
    await supabase.from('delivery_zones').delete().eq('id', zone.id);
    const updated = deliveryZones.filter((z) => z.id !== zone.id);
    persistLocalZones(updated);
    setNotice(`تم حذف منطقة (${zone.areaName}) من قائمة الأسعار.`);
    setBusyId(null);
  };

  // إيقاف الكاميرا عند الخروج من التحقق
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startFaceCamera = async () => {
    setFaceError(null);
    setCapturedSelfie('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 320, height: 320 },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setFaceError('تعذر تشغيل الكاميرا الأمامية. يرجى السماح بصلاحية الكاميرا في المتصفح أو التقاط صورة مباشرة.');
    }
  };

  const captureSelfieFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, 240, 240);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedSelfie(dataUrl);
    stopCamera();
  };

  const handleFallbackSelfieUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCapturedSelfie(reader.result);
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  const confirmFaceMatchAndEnter = async () => {
    if (!pendingFaceAdmin || !capturedSelfie) {
      setFaceError('يجب التقاط صورة لوجهك أولاً للمطابقة مع صورة الحساب.');
      return;
    }
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        authenticated: true,
        role: 'sub',
        name: pendingFaceAdmin.name,
        username: pendingFaceAdmin.username,
        avatar: pendingFaceAdmin.facePhotoBase64,
        verifiedSelfie: capturedSelfie,
        verifiedAt: new Date().toISOString(),
      })
    );
    setAdminName(pendingFaceAdmin.name);
    setAdminRole('sub');
    setAdminAvatar(pendingFaceAdmin.facePhotoBase64);
    setPendingFaceAdmin(null);
    setCapturedSelfie('');
    setAuthenticated(true);
    await loadAllData(false);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    const idClean = loginIdentifier.trim().toLowerCase();
    const passClean = password.trim();

    if (!idClean || !passClean) {
      setLoginError('يرجى إدخال اسم المستخدم أو البريد وكلمة المرور.');
      setLoggingIn(false);
      return;
    }

    if (idClean === SUPER_ADMIN_EMAIL && SUPER_ADMIN_PASSWORDS.includes(passClean)) {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          authenticated: true,
          role: 'super',
          name: 'المدير العام (المالك)',
          username: SUPER_ADMIN_EMAIL,
        })
      );
      setAdminName('المدير العام (المالك)');
      setAdminRole('super');
      setAuthenticated(true);
      setLoggingIn(false);
      await loadAllData(false);
      return;
    }

    const matchedSubAdmin = subAdmins.find(
      (adm) => adm.username.trim().toLowerCase() === idClean && adm.password === passClean
    );
    if (matchedSubAdmin) {
      if (!matchedSubAdmin.active) {
        setLoginError('هذا الحساب موقوف من قِبل المدير العام.');
        setLoggingIn(false);
        return;
      }
      setPendingFaceAdmin(matchedSubAdmin);
      setLoggingIn(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: idClean,
        password: passClean,
      });

      if (error || !data.user) {
        setLoginError('بيانات الدخول غير صحيحة أو الحساب غير مفعّل.');
        setLoggingIn(false);
        return;
      }

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          authenticated: true,
          role: 'super',
          name: data.user.email || 'مدير ودي',
          username: data.user.email,
        })
      );
      setAdminName(data.user.email || 'مدير ودي');
      setAdminRole('super');
      setAuthenticated(true);
      setLoggingIn(false);
      await loadAllData(false);
    } catch {
      setLoginError('تعذر إتمام تسجيل الدخول. حاول مرة أخرى.');
      setLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    stopCamera();
    localStorage.removeItem(SESSION_KEY);
    await supabase.auth.signOut();
    setAuthenticated(false);
    setPendingFaceAdmin(null);
  };

  // تحديث الطلبات
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
      setErrorMsg('لا يمكن إسناد الطلب لهذا المندوب لأن حسابه بانتظار القبول والتفعيل.');
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
      setNotice(`تم إسناد الطلب #${order.id.slice(0, 8)} للمندوب بنجاح.`);
      await loadAllData(false);
    } else {
      setErrorMsg('لم يتم الحفظ في قاعدة البيانات؛ تحقق من صلاحيات التحديث في جدول orders.');
    }
    setBusyId(null);
  };

  const handleAutoDispatch = async (order: UnifiedOrder) => {
    const target = drivers.find((d) => d.isApproved && d.isOnline) || drivers.find((d) => d.isApproved);
    if (!target) {
      setErrorMsg('لا يوجد مندوبون مقبولون ومفعّلون للتوجيه التلقائي حالياً.');
      return;
    }
    await handleAssignDriver(order, target.id);
  };

  const handleStatusChange = async (order: UnifiedOrder, nextStatus: string) => {
    if (!order.id || !nextStatus) return;
    setBusyId(order.id);
    setNotice(null);
    setErrorMsg(null);

    const saved = await persistOrderUpdate(order.id, [{ status: nextStatus }, { order_status: nextStatus }]);
    if (saved) {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
      setNotice(`تم تغيير حالة الطلب #${order.id.slice(0, 8)} إلى (${formatStatusLabel(nextStatus)}).`);
      await loadAllData(false);
    } else {
      setErrorMsg('تعذر تحديث حالة الطلب.');
    }
    setBusyId(null);
  };

  // قبول وتفعيل أو إيقاف أو حذف الحسابات المخالفة
  const handleApproveOrToggleAccount = async (profile: UnifiedProfile, forceApprove?: boolean) => {
    const nextApproved = forceApprove !== undefined ? forceApprove : !profile.isApproved;
    setBusyId(profile.id);
    setNotice(null);
    setErrorMsg(null);

    const tablesToTry: ('partners' | 'profiles')[] =
      profile.sourceTable === 'partners' ? ['partners', 'profiles'] : ['profiles', 'partners'];
    const idCols = ['id', 'user_id', 'profile_id', 'partner_id'];
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
    for (const tableName of tablesToTry) {
      for (const col of idCols) {
        for (const body of payloads) {
          const res = await supabase.from(tableName).update(body).eq(col, profile.id).select();
          if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
            saved = true;
            break;
          }
        }
        if (saved) break;
      }
      if (saved) break;
    }

    if (saved) {
      setNotice(
        nextApproved
          ? `تم قبول وتفعيل حساب (${profile.fullName}) — ظهرت العلامة الخضراء.`
          : `تم إيقاف حساب (${profile.fullName}) — تحول إلى العلامة البنية.`
      );
      await loadAllData(false);
    } else {
      setErrorMsg('تعذر تعديل حالة الحساب في Supabase؛ تأكد من سياسات RLS.');
    }
    setBusyId(null);
  };

  const handleDeleteViolatingAccount = async (profile: UnifiedProfile) => {
    setBusyId(profile.id);
    setNotice(null);
    setErrorMsg(null);

    const tablesToTry: ('partners' | 'profiles')[] =
      profile.sourceTable === 'partners' ? ['partners', 'profiles'] : ['profiles', 'partners'];
    const idCols = ['id', 'user_id', 'profile_id', 'partner_id'];
    let deleted = false;

    for (const tableName of tablesToTry) {
      for (const col of idCols) {
        const res = await supabase.from(tableName).delete().eq(col, profile.id).select();
        if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
          deleted = true;
          break;
        }
      }
      if (deleted) break;
    }

    if (deleted) {
      setNotice(`تمت إزالة الحساب المخالف (${profile.fullName}) نهائياً.`);
      await loadAllData(false);
    } else {
      await handleApproveOrToggleAccount(profile, false);
      setErrorMsg('تم إيقاف الحساب فوراً؛ الحذف النهائي يتطلب صلاحية DELETE في Supabase.');
    }
    setBusyId(null);
  };

  const handleResetDriverAccount = (drv: UnifiedProfile) => {
    const nowIso = new Date().toISOString();
    const updated = { ...settledAtByDriver, [drv.id]: nowIso };
    setSettledAtByDriver(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SETTLEMENT_KEY, JSON.stringify(updated));
    }
    setNotice(`تم تصفير حساب المندوب (${drv.fullName}) بعد انتهاء العمل والحساب.`);
  };

  const handleNewAdminPhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewAdminPhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSubAdmin = (e: FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim() || !newAdminUsername.trim() || !newAdminPassword.trim()) {
      setErrorMsg('يرجى إدخال اسم المدير واليوزر وكلمة المرور.');
      return;
    }
    if (!newAdminPhoto) {
      setErrorMsg('يجب رفع صورة وجه المدير مباشرة لتفعيل خاصية الأمان البيومتري عند الدخول.');
      return;
    }

    const exists = subAdmins.some(
      (a) => a.username.trim().toLowerCase() === newAdminUsername.trim().toLowerCase()
    );
    if (exists) {
      setErrorMsg('اسم المستخدم (اليوزر) موجود مسبقاً لمدير آخر.');
      return;
    }

    const created: SubAdminAccount = {
      id: `adm-${Date.now()}`,
      name: newAdminName.trim(),
      username: newAdminUsername.trim(),
      password: newAdminPassword.trim(),
      facePhotoBase64: newAdminPhoto,
      active: true,
      createdAt: new Date().toISOString(),
    };

    const nextList = [created, ...subAdmins];
    setSubAdmins(nextList);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SUB_ADMINS_KEY, JSON.stringify(nextList));
    }
    setNewAdminName('');
    setNewAdminUsername('');
    setNewAdminPassword('');
    setNewAdminPhoto('');
    setErrorMsg(null);
    setNotice(`تم إنشاء حساب المدير (${created.name}) وتفعيل التحقق بالوجه له.`);
  };

  const handleToggleSubAdmin = (id: string) => {
    const nextList = subAdmins.map((a) => (a.id === id ? { ...a, active: !a.active } : a));
    setSubAdmins(nextList);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SUB_ADMINS_KEY, JSON.stringify(nextList));
    }
  };

  const handleDeleteSubAdmin = (id: string) => {
    const nextList = subAdmins.filter((a) => a.id !== id);
    setSubAdmins(nextList);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SUB_ADMINS_KEY, JSON.stringify(nextList));
    }
    setNotice('تم حذف حساب المدير.');
  };

  const partnerGroups = useMemo(() => {
    return {
      restaurants: partners.filter((p) => p.partnerCategory === 'restaurants'),
      stores: partners.filter((p) => p.partnerCategory === 'stores'),
      markets: partners.filter((p) => p.partnerCategory === 'markets'),
      pages: partners.filter((p) => p.partnerCategory === 'pages'),
    };
  }, [partners]);

  const pendingAccounts = useMemo(() => {
    return [...partners, ...drivers].filter((acc) => !acc.isApproved);
  }, [partners, drivers]);

  const driverNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of drivers) map[d.id] = d.fullName;
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
      map[d.id] = { ordersCount: 0, totalFeeBeforeDiscount: 0, totalDiscount25: 0, totalFeeAfterDiscount: 0 };
    }

    for (const ord of orders) {
      if (!ord.driverId) continue;
      const settledAt = settledAtByDriver[ord.driverId];
      if (settledAt && ord.createdAt && Date.parse(ord.createdAt) <= Date.parse(settledAt)) {
        continue;
      }
      if (!map[ord.driverId]) {
        map[ord.driverId] = { ordersCount: 0, totalFeeBeforeDiscount: 0, totalDiscount25: 0, totalFeeAfterDiscount: 0 };
      }
      const d25 = ord.deliveryFee * 0.25;
      map[ord.driverId].ordersCount += 1;
      map[ord.driverId].totalFeeBeforeDiscount += ord.deliveryFee;
      map[ord.driverId].totalDiscount25 += d25;
      map[ord.driverId].totalFeeAfterDiscount += Math.max(0, ord.deliveryFee - d25);
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

  const filteredZones = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    if (!q) return deliveryZones;
    return deliveryZones.filter((z) => z.areaName.toLowerCase().includes(q));
  }, [deliveryZones, zoneSearch]);

  const growthStats = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    const weeklyBuckets = [
      { label: 'قبل 3 أسابيع', count: 0, revenue: 0 },
      { label: 'قبل أسبوعين', count: 0, revenue: 0 },
      { label: 'الأسبوع الماضي', count: 0, revenue: 0 },
      { label: 'هذا الأسبوع', count: 0, revenue: 0 },
    ];

    const monthNames = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const monthlyMap: Record<string, { label: string; count: number; revenue: number; sortKey: number }> = {};

    for (const ord of orders) {
      const ts = Date.parse(ord.createdAt) || now;
      const diffDays = Math.floor((now - ts) / dayMs);

      if (diffDays >= 0 && diffDays < 7) {
        weeklyBuckets[3].count += 1;
        weeklyBuckets[3].revenue += ord.deliveryFee;
      } else if (diffDays >= 7 && diffDays < 14) {
        weeklyBuckets[2].count += 1;
        weeklyBuckets[2].revenue += ord.deliveryFee;
      } else if (diffDays >= 14 && diffDays < 21) {
        weeklyBuckets[1].count += 1;
        weeklyBuckets[1].revenue += ord.deliveryFee;
      } else if (diffDays >= 21 && diffDays < 28) {
        weeklyBuckets[0].count += 1;
        weeklyBuckets[0].revenue += ord.deliveryFee;
      }

      const d = new Date(ts);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
          count: 0,
          revenue: 0,
          sortKey: d.getFullYear() * 100 + d.getMonth(),
        };
      }
      monthlyMap[key].count += 1;
      monthlyMap[key].revenue += ord.deliveryFee;
    }

    const monthlySeries = Object.values(monthlyMap)
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(-6);

    const maxWeekly = Math.max(1, ...weeklyBuckets.map((w) => w.count));
    const maxMonthly = Math.max(1, ...monthlySeries.map((m) => m.count));

    return {
      thisWeekOrders: weeklyBuckets[3].count,
      weeklyBuckets,
      monthlySeries,
      maxWeekly,
      maxMonthly,
    };
  }, [orders]);

  const palette = useMemo(() => {
    if (themeBrightness === 'light') {
      return {
        bg: '#f1f5f9',
        card: '#ffffff',
        subCard: '#f8fafc',
        border: '#cbd5e1',
        text: '#0f172a',
        muted: '#475569',
        inputBg: '#ffffff',
      };
    }
    if (themeBrightness === 'midnight') {
      return {
        bg: '#0f172a',
        card: '#1e293b',
        subCard: '#0f172a',
        border: '#334155',
        text: '#f8fafc',
        muted: '#94a3b8',
        inputBg: '#0f172a',
      };
    }
    return {
      bg: '#090d16',
      card: '#111827',
      subCard: '#0b1220',
      border: '#1f2937',
      text: '#f8fafc',
      muted: '#94a3b8',
      inputBg: '#0f172a',
    };
  }, [themeBrightness]);

  const renderApprovalBadge = (isApproved: boolean) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 999,
        background: isApproved ? 'rgba(16, 185, 129, 0.16)' : 'rgba(146, 64, 14, 0.25)',
        border: `1px solid ${isApproved ? '#10b981' : '#92400e'}`,
        color: isApproved ? '#34d399' : '#d97706',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isApproved ? '#10b981' : '#92400e',
        }}
      />
      {isApproved ? 'مقبول ومفعّل (علامة خضراء)' : 'بانتظار القبول (علامة بنية)'}
    </span>
  );

  const renderPartnerCard = (prt: UnifiedProfile) => (
    <div
      key={`${prt.sourceTable}-${prt.id}`}
      style={{
        background: palette.card,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {prt.avatarUrl ? (
            <img
              src={prt.avatarUrl}
              alt={prt.fullName}
              style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#1e293b',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                color: '#38bdf8',
              }}
            >
              {prt.fullName.slice(0, 1)}
            </div>
          )}
          <div>
            <strong style={{ fontSize: 15 }}>{prt.fullName}</strong>
            <div style={{ color: palette.muted, fontSize: 12 }}>اليوزر: {prt.username}</div>
          </div>
        </div>

        {renderApprovalBadge(prt.isApproved)}
      </div>

      <div style={{ color: palette.muted, fontSize: 13 }}>
        الهاتف: <strong style={{ color: palette.text }}>{prt.phone || 'غير متوفر'}</strong> • العنوان:{' '}
        <strong style={{ color: palette.text }}>{prt.address}</strong>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button
          type="button"
          disabled={busyId === prt.id}
          onClick={() => void handleApproveOrToggleAccount(prt)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: prt.isApproved ? '#92400e' : '#15803d',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {prt.isApproved ? 'إيقاف الحساب' : 'قبول وتفعيل الحساب'}
        </button>

        <button
          type="button"
          disabled={busyId === prt.id}
          onClick={() => void handleDeleteViolatingAccount(prt)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #ef4444',
            background: 'transparent',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          إزالة حساب مخالف
        </button>
      </div>
    </div>
  );

  if (checkingAuth) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#090d16',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
        }}
      >
        <p>جاري تحميل لوحة إدارة ودي...</p>
      </main>
    );
  }

  if (!authenticated && pendingFaceAdmin) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#090d16',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
          padding: 20,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20 }}>التحقق الأمني بصورة الوجه</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            مرحباً <strong>{pendingFaceAdmin.name}</strong>. لا يمكن دخول لوحة التحكم إلا بعد التقاط صورة لوجهك ومقارنتها بصورة حسابك.
          </p>

          {faceError && (
            <div style={{ padding: 10, borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', fontSize: 13 }}>
              {faceError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#0f172a', padding: 10, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>صورة الحساب المسجلة</div>
              <img
                src={pendingFaceAdmin.facePhotoBase64}
                alt={pendingFaceAdmin.name}
                style={{ width: 110, height: 110, borderRadius: 10, objectFit: 'cover', border: '2px solid #2563eb' }}
              />
            </div>

            <div style={{ background: '#0f172a', padding: 10, borderRadius: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>الصورة الملتقطة الآن</div>
              {capturedSelfie ? (
                <img
                  src={capturedSelfie}
                  alt="Selfie"
                  style={{ width: 110, height: 110, borderRadius: 10, objectFit: 'cover', border: '2px solid #10b981' }}
                />
              ) : (
                <div
                  style={{
                    width: 110,
                    height: 110,
                    margin: '0 auto',
                    borderRadius: 10,
                    border: '1px dashed #475569',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    color: '#64748b',
                  }}
                >
                  بانتظار الالتقاط
                </div>
              )}
            </div>
          </div>

          {cameraActive && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: '100%', maxHeight: 220, borderRadius: 12, background: '#000', objectFit: 'cover' }}
              />
              <button
                type="button"
                onClick={captureSelfieFrame}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                التقاط صورة الوجه الآن
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void startFaceCamera()}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #38bdf8',
                background: '#0f172a',
                color: '#38bdf8',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              فتح الكاميرا الأمامية
            </button>

            <label
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                border: '1px solid #475569',
                background: '#1e293b',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              التقاط بالكاميرا المباشرة
              <input
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFallbackSelfieUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <button
            type="button"
            disabled={!capturedSelfie}
            onClick={() => void confirmFaceMatchAndEnter()}
            style={{
              padding: 12,
              borderRadius: 8,
              border: 'none',
              background: capturedSelfie ? '#2563eb' : '#334155',
              color: '#fff',
              fontWeight: 700,
              cursor: capturedSelfie ? 'pointer' : 'not-allowed',
            }}
          >
            تأكيد المطابقة والدخول إلى لوحة التحكم
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setPendingFaceAdmin(null);
            }}
            style={{
              padding: 8,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            رجوع لتسجيل الدخول
          </button>
        </div>
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
          background: '#090d16',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
          padding: 20,
        }}
      >
        <form
          onSubmit={handleLoginSubmit}
          style={{
            width: '100%',
            maxWidth: 390,
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22 }}>دخول إدارة ودي</h1>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
            أدخل بيانات المدير العام أو يوزر المدير المفعّل
          </p>

          {loginError && (
            <div style={{ padding: 10, borderRadius: 8, background: '#450a0a', border: '1px solid #ef4444', fontSize: 13 }}>
              {loginError}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            البريد الإلكتروني أو اليوزر
            <input
              type="text"
              required
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
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
              padding: 12,
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            {loggingIn ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>
        </form>
      </main>
    );
  }

  const navItems: { id: NavTab; label: string; count?: number; badgeColor?: string }[] = [
    { id: 'orders', label: 'الطلبات والتوجيه', count: orders.length },
    { id: 'partners_km', label: 'الشركاء وتسعير الكيلومتر', count: partners.length },
    { id: 'delivery_prices', label: 'أسعار التوصيل والمناطق', count: deliveryZones.length },
    {
      id: 'approvals',
      label: 'قبول إنشاء الحسابات',
      count: pendingAccounts.length,
      badgeColor: pendingAccounts.length > 0 ? '#92400e' : undefined,
    },
    { id: 'restaurants', label: 'قسم المطاعم', count: partnerGroups.restaurants.length },
    { id: 'stores', label: 'قسم المتاجر', count: partnerGroups.stores.length },
    { id: 'markets', label: 'قسم الأسواق', count: partnerGroups.markets.length },
    { id: 'pages', label: 'قسم البيجات', count: partnerGroups.pages.length },
    { id: 'drivers', label: 'قسم المندوبين', count: drivers.length },
    { id: 'stats', label: 'الإحصائيات والنمو' },
    { id: 'admins', label: 'قسم المدراء والأمان', count: subAdmins.length + 1 },
    { id: 'settings', label: 'إعدادات لوحة التحكم' },
  ];

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: palette.bg,
        color: palette.text,
        fontFamily: 'sans-serif',
      }}
    >
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 40,
          }}
        />
      )}

      {/* البردة الجانبية (=) */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: drawerOpen ? 0 : -310,
          width: 290,
          height: '100vh',
          background: palette.card,
          borderLeft: `1px solid ${palette.border}`,
          zIndex: 50,
          transition: 'right 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 14,
            borderBottom: `1px solid ${palette.border}`,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {adminAvatar && (
              <img
                src={adminAvatar}
                alt={adminName}
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
              />
            )}
            <div>
              <strong style={{ fontSize: 15 }}>أقسام إدارة ودي</strong>
              <div style={{ fontSize: 11, color: palette.muted }}>{adminName}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: palette.subCard,
              color: palette.text,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setDrawerOpen(false);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '11px 12px',
                  borderRadius: 10,
                  border: active ? '1px solid #2563eb' : '1px solid transparent',
                  background: active ? 'rgba(37, 99, 235, 0.16)' : 'transparent',
                  color: active ? '#60a5fa' : palette.text,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  textAlign: 'right',
                }}
              >
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: item.badgeColor || (active ? '#2563eb' : palette.subCard),
                      color: '#fff',
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          style={{
            marginTop: 16,
            padding: 11,
            borderRadius: 10,
            border: 'none',
            background: '#dc2626',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          تسجيل الخروج
        </button>
      </aside>

      {/* الشريط العلوي */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: palette.card,
          borderBottom: `1px solid ${palette.border}`,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            aria-label="فتح القائمة الجانبية"
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${palette.border}`,
              background: palette.subCard,
              color: palette.text,
              fontSize: 18,
              fontWeight: 700,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ≡
          </button>

          <div>
            <h1 style={{ margin: 0, fontSize: 18 }}>إدارة ودي — Wadi Admin</h1>
            <div style={{ fontSize: 12, color: palette.muted }}>
              {navItems.find((n) => n.id === activeTab)?.label}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab('partners_km')}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #FF8A00',
              background: 'rgba(255, 138, 0, 0.14)',
              color: '#FF9E2C',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            الشركاء والكيلومتر
          </button>

          <button
            type="button"
            onClick={() => playNotificationTone(soundStyle, 2)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #f59e0b',
              background: 'rgba(245, 158, 11, 0.14)',
              color: '#fbbf24',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            اختبار الصوت
          </button>

          <button
            type="button"
            onClick={() => void loadAllData(false)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${palette.border}`,
              background: palette.subCard,
              color: palette.text,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            تحديث
          </button>
        </div>
      </header>

      <main style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
        {notice && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.16)',
              border: '1px solid #10b981',
              marginBottom: 16,
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="إغلاق الإشعار"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#34d399',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.16)',
              border: '1px solid #ef4444',
              marginBottom: 16,
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="إغلاق التنبيه"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f87171',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* قسم إدارة الشركاء وأسعار الكيلومتر والمناطق المباشرة */}
        {activeTab === 'partners_km' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <WadiPricingAndPartnersAdmin />
          </section>
        )}

        {/* 1. قسم الطلبات والتوجيه */}
        {activeTab === 'orders' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: 10,
              }}
            >
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>إجمالي الطلبات</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{loading ? '...' : orders.length}</div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>بانتظار القبول</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#d97706' }}>
                  {pendingAccounts.length}
                </div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>المندوبون</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{drivers.length}</div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>المناطق المسعّرة</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#38bdf8' }}>
                  {deliveryZones.length}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالرقم، الشريك، العميل، أو المنطقة..."
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.inputBg,
                  color: palette.text,
                  fontSize: 13,
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.inputBg,
                  color: palette.text,
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

            {filteredOrders.length === 0 ? (
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20, color: palette.muted }}>
                لا توجد طلبات مطابقة حالياً.
              </div>
            ) : (
              filteredOrders.map((ord) => {
                const chosenDriver = selectedDriverByOrder[ord.id] ?? ord.driverId;
                const assignedName = ord.driverId
                  ? driverNameById[ord.driverId] || `مندوب (${ord.driverId.slice(0, 6)})`
                  : 'غير مسند';

                return (
                  <div
                    key={ord.id}
                    style={{
                      background: palette.card,
                      border: `1px solid ${palette.border}`,
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
                        {formatStatusLabel(ord.status)} • المندوب: {assignedName}
                      </span>
                    </div>

                    <div style={{ color: palette.muted, fontSize: 13 }}>
                      العميل: {ord.customerName} • المنطقة: {ord.area}
                    </div>

                    <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>
                      سعر توصيل الطلب من الشريك: {formatIQD(ord.deliveryFee)} • بعد خصم 25%: {formatIQD(ord.netAfterDiscount)}
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
                          border: `1px solid ${palette.border}`,
                          background: palette.inputBg,
                          color: palette.text,
                          minWidth: 165,
                        }}
                      >
                        <option value="">اختر مندوباً مفعّلاً...</option>
                        {drivers.map((drv) => (
                          <option key={drv.id} value={drv.id} disabled={!drv.isApproved}>
                            {drv.fullName} {!drv.isApproved ? '(بانتظار التفعيل)' : drv.isOnline ? '(متاح)' : ''}
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
                          fontSize: 12,
                          fontWeight: 700,
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
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        توجيه تلقائي
                      </button>

                      <select
                        value={ord.status}
                        disabled={busyId === ord.id}
                        onChange={(e) => void handleStatusChange(ord, e.target.value)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: `1px solid ${palette.border}`,
                          background: palette.inputBg,
                          color: palette.text,
                          fontSize: 12,
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
        )}

        {/* 2. قسم أسعار التوصيل والمناطق */}
        {activeTab === 'delivery_prices' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>إدارة أسعار التوصيل حسب المنطقة ({deliveryZones.length})</h2>
              <p style={{ margin: '6px 0 0', color: palette.muted, fontSize: 13 }}>
                أضف اسم كل منطقة وسعر توصيلها بالدينار العراقي؛ وبمجرد أن يدخل الشريك اسم منطقة الزبون في تطبيقه يظهر له هذا السعر تلقائياً، ويمكنك تعديله في أي وقت.
              </p>
            </div>

            <form
              onSubmit={handleAddDeliveryZone}
              style={{
                background: palette.card,
                border: `1px solid ${palette.border}`,
                borderRadius: 14,
                padding: 16,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <input
                type="text"
                required
                placeholder="اسم المنطقة (مثلاً: الرمادي - التأميم)"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                style={{
                  flex: 2,
                  minWidth: 190,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.inputBg,
                  color: palette.text,
                  fontSize: 13,
                }}
              />

              <input
                type="number"
                required
                min={0}
                step={250}
                placeholder="سعر التوصيل (د.ع)"
                value={newZonePrice}
                onChange={(e) => setNewZonePrice(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 140,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.inputBg,
                  color: palette.text,
                  fontSize: 13,
                }}
              />

              <button
                type="submit"
                disabled={busyId === 'add-zone'}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#15803d',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                + إضافة منطقة وسعر
              </button>
            </form>

            {deliveryZones.length > 0 && (
              <input
                type="text"
                value={zoneSearch}
                onChange={(e) => setZoneSearch(e.target.value)}
                placeholder="بحث سريع عن منطقة..."
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  background: palette.inputBg,
                  color: palette.text,
                  fontSize: 13,
                }}
              />
            )}

            {filteredZones.length === 0 ? (
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20, color: palette.muted }}>
                لم تقم بإضافة مناطق وأسعار توصيل بعد. أضف أول منطقة من النموذج أعلاه.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {filteredZones.map((zone) => {
                  const isEditing = editingZoneId === zone.id;
                  return (
                    <div
                      key={zone.id}
                      style={{
                        background: palette.card,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 15 }}>{zone.areaName}</strong>
                        <span style={{ color: '#34d399', fontWeight: 700, fontSize: 15 }}>
                          {formatIQD(zone.priceIqd)}
                        </span>
                      </div>

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number"
                            min={0}
                            step={250}
                            value={editingZonePriceValue}
                            onChange={(e) => setEditingZonePriceValue(e.target.value)}
                            style={{
                              flex: 1,
                              padding: 8,
                              borderRadius: 8,
                              border: '1px solid #38bdf8',
                              background: palette.inputBg,
                              color: palette.text,
                              fontSize: 13,
                            }}
                          />
                          <button
                            type="button"
                            disabled={busyId === zone.id}
                            onClick={() => void handleSaveEditedZonePrice(zone)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: '#2563eb',
                              color: '#fff',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingZoneId(null)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: `1px solid ${palette.border}`,
                              background: 'transparent',
                              color: palette.muted,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingZoneId(zone.id);
                              setEditingZonePriceValue(String(zone.priceIqd));
                            }}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #38bdf8',
                              background: 'transparent',
                              color: '#38bdf8',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            تعديل السعر
                          </button>

                          <button
                            type="button"
                            disabled={busyId === zone.id}
                            onClick={() => void handleDeleteDeliveryZone(zone)}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              border: '1px solid #ef4444',
                              background: 'transparent',
                              color: '#ef4444',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 3. قسم قبول إنشاء الحسابات */}
        {activeTab === 'approvals' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>طلبات إنشاء الحسابات الجديدة ({pendingAccounts.length})</h2>
              <p style={{ margin: '6px 0 0', color: palette.muted, fontSize: 13 }}>
                كل حساب جديد من تطبيق الشريك أو تطبيق المندوب يظهر هنا بعلامة <strong>بنية</strong> حتى تقبله وتفعّله فتتحول إلى علامة <strong>خضراء</strong>، أو تزيله إذا كان مخالفاً.
              </p>
            </div>

            {pendingAccounts.length === 0 ? (
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20, color: palette.muted }}>
                لا توجد طلبات إنشاء حساب معلّقة حالياً؛ جميع الحسابات الحالية مفعّلة.
              </div>
            ) : (
              pendingAccounts.map((acc) => (
                <div
                  key={`${acc.sourceTable}-${acc.id}`}
                  style={{
                    background: palette.card,
                    border: '1px solid #92400e',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {acc.avatarUrl && (
                        <img
                          src={acc.avatarUrl}
                          alt={acc.fullName}
                          style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <div>
                        <strong>{acc.fullName}</strong>
                        <div style={{ fontSize: 12, color: palette.muted }}>
                          النوع: {acc.role === 'driver' ? 'مندوب توصيل' : 'شريك تجاري'} • اليوزر: {acc.username}
                        </div>
                      </div>
                    </div>
                    {renderApprovalBadge(acc.isApproved)}
                  </div>

                  <div style={{ fontSize: 13, color: palette.muted }}>
                    الهاتف: <strong style={{ color: palette.text }}>{acc.phone || 'غير متوفر'}</strong> • العنوان:{' '}
                    <strong style={{ color: palette.text }}>{acc.address}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={busyId === acc.id}
                      onClick={() => void handleApproveOrToggleAccount(acc, true)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#15803d',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      قبول وتفعيل الحساب (علامة خضراء)
                    </button>

                    <button
                      type="button"
                      disabled={busyId === acc.id}
                      onClick={() => void handleDeleteViolatingAccount(acc)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: '1px solid #ef4444',
                        background: 'transparent',
                        color: '#ef4444',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      رفض وإزالة الحساب المخالف
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        )}

        {/* 4. أقسام الشركاء: المطاعم / المتاجر / الأسواق / البيجات */}
        {(activeTab === 'restaurants' ||
          activeTab === 'stores' ||
          activeTab === 'markets' ||
          activeTab === 'pages') && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {navItems.find((n) => n.id === activeTab)?.label} — عدد الحسابات المنشأة:{' '}
                <span style={{ color: '#38bdf8' }}>{partnerGroups[activeTab].length}</span>
              </h2>
            </div>

            {partnerGroups[activeTab].length === 0 ? (
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20, color: palette.muted }}>
                لا توجد حسابات منشأة في هذا القسم حتى الآن.
              </div>
            ) : (
              partnerGroups[activeTab].map(renderPartnerCard)
            )}
          </section>
        )}

        {/* 5. قسم المندوبين */}
        {activeTab === 'drivers' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>قسم المندوبين ({drivers.length})</h2>
              <p style={{ margin: '6px 0 0', color: palette.muted, fontSize: 13 }}>
                بيانات كل مندوب وصورته ويوزره ورقمه، التتبع المباشر، ومحاسبة التوصيل قبل وبعد خصم 25% مع زر التصفير.
              </p>
            </div>

            {drivers.length === 0 ? (
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 20, color: palette.muted }}>
                لا يوجد مندوبون مسجلون حالياً.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
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
                      key={`${drv.sourceTable}-${drv.id}`}
                      style={{
                        background: palette.card,
                        border: `1px solid ${palette.border}`,
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {drv.avatarUrl ? (
                            <img
                              src={drv.avatarUrl}
                              alt={drv.fullName}
                              style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #2563eb' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: '#1e293b',
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 700,
                                fontSize: 18,
                                color: '#38bdf8',
                              }}
                            >
                              {drv.fullName.slice(0, 1)}
                            </div>
                          )}
                          <div>
                            <strong style={{ fontSize: 15 }}>{drv.fullName}</strong>
                            <div style={{ color: palette.muted, fontSize: 12 }}>اليوزر: {drv.username}</div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: drv.isOnline ? 'rgba(56, 189, 248, 0.16)' : palette.subCard,
                            color: drv.isOnline ? '#38bdf8' : palette.muted,
                          }}
                        >
                          {drv.isOnline ? 'متصل' : 'غير متصل'}
                        </span>
                      </div>

                      <div>{renderApprovalBadge(drv.isApproved)}</div>

                      <div style={{ fontSize: 13, color: palette.muted }}>
                        رقم الهاتف: <strong style={{ color: palette.text }}>{drv.phone || 'غير متوفر'}</strong>
                      </div>

                      <div style={{ fontSize: 13, color: palette.muted }}>
                        التتبع: {hasCoords ? `${drv.lat}, ${drv.lng}` : drv.locationLabel || 'لا يوجد موقع مباشر'}
                        {mapUrl && (
                          <>
                            {' — '}
                            <a href={mapUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                              فتح الخريطة
                            </a>
                          </>
                        )}
                      </div>

                      <div
                        style={{
                          background: palette.subCard,
                          border: `1px solid ${palette.border}`,
                          borderRadius: 10,
                          padding: 12,
                          fontSize: 13,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div>عدد الطلبات الحالية: <strong>{acc.ordersCount}</strong></div>
                        <div>إجمالي فلوس التوصيل (قبل الخصم): <strong>{formatIQD(acc.totalFeeBeforeDiscount)}</strong></div>
                        <div>قيمة خصم 25%: <strong>{formatIQD(acc.totalDiscount25)}</strong></div>
                        <div style={{ color: '#34d399', fontWeight: 700 }}>
                          الصافي بعد خصم 25%: {formatIQD(acc.totalFeeAfterDiscount)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={busyId === drv.id}
                          onClick={() => void handleApproveOrToggleAccount(drv)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: drv.isApproved ? '#92400e' : '#15803d',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          {drv.isApproved ? 'إيقاف المندوب' : 'تفعيل المندوب'}
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
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          تصفير الحساب
                        </button>

                        <button
                          type="button"
                          disabled={busyId === drv.id}
                          onClick={() => void handleDeleteViolatingAccount(drv)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #ef4444',
                            background: 'transparent',
                            color: '#ef4444',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          إزالة مخالف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 6. قسم الإحصائيات وخطوط النمو */}
        {activeTab === 'stats' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>طلبات هذا الأسبوع</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#38bdf8' }}>
                  {growthStats.thisWeekOrders}
                </div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>إجمالي الطلبات</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{orders.length}</div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>الشركاء النشطون</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#34d399' }}>
                  {partners.filter((p) => p.isApproved).length}
                </div>
              </div>
              <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ color: palette.muted, fontSize: 12 }}>المندوبون النشطون</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, color: '#fbbf24' }}>
                  {drivers.filter((d) => d.isApproved).length}
                </div>
              </div>
            </div>

            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>الطلبات المستقبلة في كل أسبوع (آخر 4 أسابيع)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {growthStats.weeklyBuckets.map((wk) => {
                  const pct = Math.max(6, Math.round((wk.count / growthStats.maxWeekly) * 100));
                  return (
                    <div key={wk.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span>{wk.label}</span>
                        <strong>
                          {wk.count} طلب ({formatIQD(wk.revenue)})
                        </strong>
                      </div>
                      <div style={{ height: 12, borderRadius: 999, background: palette.subCard, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
                            borderRadius: 999,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>لوح النمو الشهري لشركة التوصيل</h3>
              {growthStats.monthlySeries.length === 0 ? (
                <p style={{ color: palette.muted, fontSize: 13 }}>لا توجد بيانات كافية للرسم الشهري بعد.</p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${growthStats.monthlySeries.length}, minmax(60px, 1fr))`,
                    gap: 12,
                    alignItems: 'end',
                    minHeight: 180,
                    paddingTop: 16,
                  }}
                >
                  {growthStats.monthlySeries.map((m) => {
                    const barHeight = Math.max(24, Math.round((m.count / growthStats.maxMonthly) * 130));
                    return (
                      <div key={m.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 12, color: '#34d399' }}>{m.count}</strong>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: 44,
                            height: barHeight,
                            borderRadius: '8px 8px 0 0',
                            background: 'linear-gradient(180deg, #10b981, #059669)',
                          }}
                        />
                        <span style={{ fontSize: 11, color: palette.muted, textAlign: 'center' }}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 7. قسم المدراء والأمان البيومتري بالوجه */}
        {activeTab === 'admins' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>قسم المدراء والأمان البيومتري</h2>
              <p style={{ margin: '6px 0 0', color: palette.muted, fontSize: 13 }}>
                أضف مدراء جدداً بالاسم واليوزر وصورة وجههم مباشرة من الجوال. عند تسجيل دخول أي مدير مضاف، يُطلب منه التقاط صورة لوجهه لمطابقتها مع صورة ملفه قبل فتح لوحة التحكم.
              </p>
            </div>

            {adminRole === 'super' && (
              <form
                onSubmit={handleCreateSubAdmin}
                style={{
                  background: palette.card,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 14,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>إنشاء حساب مدير جديد</h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <input
                    type="text"
                    required
                    placeholder="الاسم الكامل للمدير"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${palette.border}`,
                      background: palette.inputBg,
                      color: palette.text,
                    }}
                  />
                  <input
                    type="text"
                    required
                    placeholder="اليوزر (اسم المستخدم للدخول)"
                    value={newAdminUsername}
                    onChange={(e) => setNewAdminUsername(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${palette.border}`,
                      background: palette.inputBg,
                      color: palette.text,
                    }}
                  />
                  <input
                    type="password"
                    required
                    placeholder="كلمة المرور"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: `1px solid ${palette.border}`,
                      background: palette.inputBg,
                      color: palette.text,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <label
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #38bdf8',
                      background: palette.subCard,
                      color: '#38bdf8',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    رفع صورة وجه المدير مباشرة (بدون رابط)
                    <input type="file" accept="image/*" onChange={handleNewAdminPhotoUpload} style={{ display: 'none' }} />
                  </label>

                  {newAdminPhoto && (
                    <img
                      src={newAdminPhoto}
                      alt="معاينة"
                      style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981' }}
                    />
                  )}
                </div>

                <button
                  type="submit"
                  style={{
                    padding: 11,
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  حفظ وتفعيل حساب المدير
                </button>
              </form>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
              <div
                style={{
                  background: palette.card,
                  border: '1px solid #2563eb',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>المدير العام (المالك)</strong>
                  {renderApprovalBadge(true)}
                </div>
                <div style={{ fontSize: 13, color: palette.muted }}>اليوزر: {SUPER_ADMIN_EMAIL}</div>
              </div>

              {subAdmins.map((adm) => (
                <div
                  key={adm.id}
                  style={{
                    background: palette.card,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={adm.facePhotoBase64}
                        alt={adm.name}
                        style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '2px solid #10b981' }}
                      />
                      <div>
                        <strong>{adm.name}</strong>
                        <div style={{ fontSize: 12, color: palette.muted }}>اليوزر: {adm.username}</div>
                      </div>
                    </div>
                    {renderApprovalBadge(adm.active)}
                  </div>

                  {adminRole === 'super' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleToggleSubAdmin(adm.id)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: adm.active ? '#92400e' : '#15803d',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {adm.active ? 'إيقاف' : 'تفعيل'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSubAdmin(adm.id)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid #ef4444',
                          background: 'transparent',
                          color: '#ef4444',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. قسم إعدادات لوحة التحكم */}
        {activeTab === 'settings' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 18 }}>إعدادات لوحة التحكم</h2>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>أنواع صوت إشعارات الطلبات</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'siren', label: 'نغمة طوارئ قوية' },
                      { id: 'urgent_bell', label: 'جرس تنبيه سريع' },
                      { id: 'double_beep', label: 'صافرة مزدوجة' },
                      { id: 'chime', label: 'نغمة هادئة' },
                    ] as { id: SoundStyle; label: string }[]
                  ).map((tone) => (
                    <button
                      key={tone.id}
                      type="button"
                      onClick={() => {
                        setSoundStyle(tone.id);
                        saveSettings({ soundStyle: tone.id });
                        playNotificationTone(tone.id, 2);
                      }}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: soundStyle === tone.id ? '2px solid #2563eb' : `1px solid ${palette.border}`,
                        background: soundStyle === tone.id ? 'rgba(37, 99, 235, 0.18)' : palette.subCard,
                        color: palette.text,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {tone.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>إضاءة ومظهر لوحة التحكم</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(
                    [
                      { id: 'dark', label: 'إضاءة ليلية داكنة (افتراضي)' },
                      { id: 'midnight', label: 'إضاءة ليلية متوسطة' },
                      { id: 'light', label: 'إضاءة نهارية ساطعة' },
                    ] as { id: ThemeBrightness; label: string }[]
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setThemeBrightness(mode.id);
                        saveSettings({ themeBrightness: mode.id });
                      }}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 8,
                        border: themeBrightness === mode.id ? '2px solid #10b981' : `1px solid ${palette.border}`,
                        background: themeBrightness === mode.id ? 'rgba(16, 185, 129, 0.18)' : palette.subCard,
                        color: palette.text,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>الإشعارات</div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => {
                      setSoundEnabled(e.target.checked);
                      saveSettings({ soundEnabled: e.target.checked });
                    }}
                  />
                  تفعيل الصوت القوي عند وصول أي طلب جديد
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={visualBannerAlerts}
                    onChange={(e) => {
                      setVisualBannerAlerts(e.target.checked);
                      saveSettings({ visualBannerAlerts: e.target.checked });
                    }}
                  />
                  إظهار شريط تنبيه مرئي أعلى الشاشة عند وصول طلب جديد
                </label>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
