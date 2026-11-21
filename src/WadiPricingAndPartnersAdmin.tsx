"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PartnerRow = {
  id: string;
  partner_code: string;
  business_name: string;
  username: string;
  phone: string;
  email: string;
  category: string;
  avatar_data?: string | null;
  is_approved: boolean;
  lat?: number | null;
  lng?: number | null;
  created_at?: string;
};

type DeliveryZone = {
  id: string;
  name: string;
  price: number;
};

type PricingSettings = {
  base_fee: number;
  price_per_km: number;
  min_fee: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: "مطعم",
  page: "بيج",
  market: "أسواق",
  store: "متجر",
};

const STYLES = {
  wrapper: {
    width: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    color: "#ffffff",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif",
  } as React.CSSProperties,
  card: {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(7, 22, 77, 0.96)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "20px",
    padding: "16px",
    boxShadow: "0 14px 34px rgba(2, 7, 28, 0.55)",
  } as React.CSSProperties,
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#040d2e",
    color: "#ffffff",
    border: "1px solid rgba(255, 255, 255, 0.18)",
    borderRadius: "12px",
    padding: "11px 12px",
    fontSize: "14px",
    outline: "none",
  } as React.CSSProperties,
  primaryBtn: {
    background: "linear-gradient(90deg, #FF8A00 0%, #FF4D00 55%, #FF241A 100%)",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    padding: "11px 16px",
    fontWeight: 800,
    fontSize: "13px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  approveBtn: {
    background: "linear-gradient(90deg, #059669, #10b981)",
    color: "#ffffff",
    border: "none",
    borderRadius: "10px",
    padding: "8px 12px",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
  } as React.CSSProperties,
  dangerBtn: {
    background: "rgba(239, 68, 68, 0.2)",
    color: "#fca5a5",
    border: "1px solid rgba(248, 113, 113, 0.45)",
    borderRadius: "10px",
    padding: "8px 12px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  } as React.CSSProperties,
};

export default function WadiPricingAndPartnersAdmin() {
  const [activeTab, setActiveTab] = useState<"partners" | "pricing" | "zones">(
    "partners"
  );

  // التسعير التلقائي بالكيلومتر
  const [baseFee, setBaseFee] = useState("3000");
  const [pricePerKm, setPricePerKm] = useState("1000");
  const [minFee, setMinFee] = useState("3000");
  const [savingPricing, setSavingPricing] = useState(false);

  // المناطق
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZonePrice, setNewZonePrice] = useState("");
  const [addingZone, setAddingZone] = useState(false);

  // الشركاء
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<"pending" | "all">(
    "pending"
  );

  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadAllData = useCallback(async () => {
    if (!supabase) return;

    const { data: pricingRow } = await supabase
      .from("pricing_settings")
      .select("base_fee, price_per_km, min_fee")
      .eq("id", 1)
      .maybeSingle();

    if (pricingRow) {
      setBaseFee(String(pricingRow.base_fee ?? 3000));
      setPricePerKm(String(pricingRow.price_per_km ?? 1000));
      setMinFee(String(pricingRow.min_fee ?? 3000));
    }

    const { data: zoneRows } = await supabase
      .from("delivery_zones")
      .select("id, name, price")
      .order("price", { ascending: true });

    if (Array.isArray(zoneRows)) {
      setZones(
        zoneRows.map((z: any) => ({
          id: String(z.id),
          name: String(z.name),
          price: Number(z.price) || 0,
        }))
      );
    }

    const { data: partnerRows } = await supabase
      .from("partners")
      .select("*")
      .order("created_at", { ascending: false });

    if (Array.isArray(partnerRows)) {
      setPartners(partnerRows as PartnerRow[]);
    }
  }, []);

  useEffect(() => {
    loadAllData();
    if (!supabase) return;

    const channel = supabase
      .channel("wadi-admin-partners-zones")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partners" },
        () => loadAllData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_zones" },
        () => loadAllData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllData]);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setNotice(null);
    setSavingPricing(true);

    const payload: PricingSettings & { id: number } = {
      id: 1,
      base_fee: Math.max(0, Number(baseFee) || 0),
      price_per_km: Math.max(0, Number(pricePerKm) || 0),
      min_fee: Math.max(0, Number(minFee) || 0),
    };

    const { error } = await supabase
      .from("pricing_settings")
      .upsert([payload], { onConflict: "id" });

    setSavingPricing(false);
    if (error) {
      setNotice({ type: "error", text: "فشل حفظ التسعير: " + error.message });
    } else {
      setNotice({
        type: "success",
        text: "تم تحديث تسعيرة الكيلومتر والحد الأدنى وتعميمها فوراً على تطبيق الشركاء.",
      });
    }
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newZoneName.trim()) return;
    setNotice(null);
    setAddingZone(true);

    const { error } = await supabase.from("delivery_zones").insert([
      {
        name: newZoneName.trim(),
        price: Math.max(0, Number(newZonePrice) || 3000),
      },
    ]);

    setAddingZone(false);
    if (error) {
      setNotice({ type: "error", text: "تعذر إضافة المنطقة: " + error.message });
    } else {
      setNewZoneName("");
      setNewZonePrice("");
      setNotice({ type: "success", text: "تمت إضافة المنطقة بنجاح." });
      loadAllData();
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!supabase) return;
    await supabase.from("delivery_zones").delete().eq("id", zoneId);
    loadAllData();
  };

  const handleTogglePartnerApproval = async (
    partnerId: string,
    approve: boolean
  ) => {
    if (!supabase) return;
    setNotice(null);
    const { error } = await supabase
      .from("partners")
      .update({ is_approved: approve })
      .eq("id", partnerId);

    if (error) {
      setNotice({ type: "error", text: error.message });
    } else {
      setNotice({
        type: "success",
        text: approve
          ? "تم تفعيل حساب الشريك ويمكنه الآن إرسال الطلبات."
          : "تم إيقاف حساب الشريك مؤقتاً.",
      });
      loadAllData();
    }
  };

  const pendingCount = partners.filter((p) => !p.is_approved).length;
  const visiblePartners =
    partnerFilter === "pending"
      ? partners.filter((p) => !p.is_approved)
      : partners;

  return (
    <section dir="rtl" style={STYLES.wrapper}>
      {/* شريط التبويبات */}
      <div
        style={{
          ...STYLES.card,
          padding: "8px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "8px",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("partners")}
          style={{
            padding: "11px 8px",
            borderRadius: "12px",
            border: "none",
            fontWeight: 800,
            fontSize: "12px",
            cursor: "pointer",
            color: "#ffffff",
            background:
              activeTab === "partners"
                ? "linear-gradient(90deg, #FF8A00, #FF331F)"
                : "#040d2e",
          }}
        >
          الشركاء ({pendingCount} بانتظار التفعيل)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pricing")}
          style={{
            padding: "11px 8px",
            borderRadius: "12px",
            border: "none",
            fontWeight: 800,
            fontSize: "12px",
            cursor: "pointer",
            color: "#ffffff",
            background:
              activeTab === "pricing"
                ? "linear-gradient(90deg, #FF8A00, #FF331F)"
                : "#040d2e",
          }}
        >
          تسعير الكيلومتر
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("zones")}
          style={{
            padding: "11px 8px",
            borderRadius: "12px",
            border: "none",
            fontWeight: 800,
            fontSize: "12px",
            cursor: "pointer",
            color: "#ffffff",
            background:
              activeTab === "zones"
                ? "linear-gradient(90deg, #FF8A00, #FF331F)"
                : "#040d2e",
          }}
        >
          مناطق التوصيل ({zones.length})
        </button>
      </div>

      {notice && (
        <div
          style={{
            borderRadius: "14px",
            padding: "12px 14px",
            fontSize: "13px",
            fontWeight: 700,
            background:
              notice.type === "error"
                ? "rgba(239, 68, 68, 0.22)"
                : "rgba(16, 185, 129, 0.22)",
            border:
              notice.type === "error"
                ? "1px solid rgba(248, 113, 113, 0.5)"
                : "1px solid rgba(52, 211, 153, 0.5)",
          }}
        >
          {notice.text}
        </div>
      )}

      {/* تبويب الموافقة على الشركاء */}
      {activeTab === "partners" && (
        <div style={STYLES.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900 }}>
              إدارة حسابات الشركاء
            </h3>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setPartnerFilter("pending")}
                style={{
                  ...STYLES.dangerBtn,
                  background:
                    partnerFilter === "pending"
                      ? "rgba(255, 138, 0, 0.28)"
                      : "#040d2e",
                  color: "#FF9E2C",
                  borderColor: "rgba(255, 138, 0, 0.45)",
                }}
              >
                بانتظار الموافقة ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setPartnerFilter("all")}
                style={{
                  ...STYLES.dangerBtn,
                  background:
                    partnerFilter === "all"
                      ? "rgba(59, 130, 246, 0.28)"
                      : "#040d2e",
                  color: "#93c5fd",
                  borderColor: "rgba(96, 165, 250, 0.45)",
                }}
              >
                الكل ({partners.length})
              </button>
            </div>
          </div>

          {visiblePartners.length === 0 ? (
            <div
              style={{
                background: "#040d2e",
                borderRadius: "14px",
                padding: "20px",
                textAlign: "center",
                fontSize: "13px",
                color: "#bfdbfe",
              }}
            >
              لا توجد حسابات في هذه القائمة حالياً.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {visiblePartners.map((partner) => (
                <div
                  key={partner.id}
                  style={{
                    background: "#040d2e",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "16px",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <img
                      src={partner.avatar_data || "/wadi-icon.png"}
                      alt={partner.business_name}
                      style={{
                        width: "46px",
                        height: "46px",
                        borderRadius: "12px",
                        objectFit: "cover",
                        border: "1px solid #FF8A00",
                      }}
                    />
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 900 }}>
                        {partner.business_name}{" "}
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#FF9E2C",
                            marginRight: "4px",
                          }}
                        >
                          ({CATEGORY_LABELS[partner.category] || partner.category} •{" "}
                          {partner.partner_code})
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#bfdbfe", marginTop: "2px" }}>
                        اليوزر: <strong>{partner.username}</strong> • الهاتف:{" "}
                        <strong>{partner.phone}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {!partner.is_approved ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleTogglePartnerApproval(partner.id, true)
                        }
                        style={STYLES.approveBtn}
                      >
                        تفعيل الشريك
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleTogglePartnerApproval(partner.id, false)
                        }
                        style={STYLES.dangerBtn}
                      >
                        إيقاف الحساب
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* تبويب تسعير الكيلومتر */}
      {activeTab === "pricing" && (
        <form
          onSubmit={handleSavePricing}
          style={{
            ...STYLES.card,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900 }}>
            التسعير التلقائي حسب المسافة (الخريطة)
          </h3>
          <p style={{ margin: 0, fontSize: "12px", color: "#bfdbfe" }}>
            المعادلة: <strong>السعر الأساسي + (المسافة بالكيلومتر × سعر الكيلومتر)</strong>، على ألا يقل عن الحد الأدنى.
          </p>

          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>
              السعر الأساسي لفتح الطلب (د.ع)
            </label>
            <input
              type="number"
              value={baseFee}
              onChange={(e) => setBaseFee(e.target.value)}
              style={STYLES.input}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>
              سعر كل كيلومتر إضافي (د.ع / كم)
            </label>
            <input
              type="number"
              value={pricePerKm}
              onChange={(e) => setPricePerKm(e.target.value)}
              style={STYLES.input}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "6px" }}>
              الحد الأدنى لأجرة التوصيل (د.ع)
            </label>
            <input
              type="number"
              value={minFee}
              onChange={(e) => setMinFee(e.target.value)}
              style={STYLES.input}
            />
          </div>

          <button
            type="submit"
            disabled={savingPricing}
            style={{ ...STYLES.primaryBtn, width: "100%", padding: "13px" }}
          >
            {savingPricing ? "جاري الحفظ..." : "حفظ وتطبيق الأسعار فوراً"}
          </button>
        </form>
      )}

      {/* تبويب مناطق التوصيل */}
      {activeTab === "zones" && (
        <div
          style={{
            ...STYLES.card,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 900 }}>
            إدارة المناطق والأسعار الثابتة
          </h3>

          <form
            onSubmit={handleAddZone}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr auto",
              gap: "8px",
            }}
          >
            <input
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              placeholder="اسم المنطقة (مثلاً: التأميم)"
              style={STYLES.input}
            />
            <input
              type="number"
              value={newZonePrice}
              onChange={(e) => setNewZonePrice(e.target.value)}
              placeholder="السعر د.ع"
              style={STYLES.input}
            />
            <button
              type="submit"
              disabled={addingZone}
              style={STYLES.primaryBtn}
            >
              {addingZone ? "..." : "إضافة"}
            </button>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {zones.map((zone) => (
              <div
                key={zone.id}
                style={{
                  background: "#040d2e",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "14px",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ fontSize: "14px" }}>{zone.name}</strong>
                  <span
                    style={{
                      marginRight: "10px",
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "#FF9E2C",
                    }}
                  >
                    {zone.price.toLocaleString()} د.ع
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteZone(zone.id)}
                  style={STYLES.dangerBtn}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
