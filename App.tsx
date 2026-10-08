import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Search, MapPin, Star, Wrench, Laptop, Smartphone, Palette, BookOpen,
  Camera, Sparkles, Plus, UserRound, LogOut, ClipboardList, Menu, X,
  ShieldCheck, LoaderCircle, AlertCircle, CheckCircle2, ArrowRight, BriefcaseBusiness
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Category, Profile, ProviderService, ServiceRequest } from "./types";

const fallbackCategories: Category[] = [
  { id: "computer", name: "صيانة الكمبيوتر", icon: "laptop", slug: "computer" },
  { id: "mobile", name: "صيانة الجوالات", icon: "mobile", slug: "mobile" },
  { id: "home", name: "خدمات المنازل", icon: "tools", slug: "home" },
  { id: "design", name: "التصميم", icon: "palette", slug: "design" },
  { id: "education", name: "التدريس", icon: "book", slug: "education" },
  { id: "photo", name: "التصوير", icon: "camera", slug: "photo" },
  { id: "other", name: "خدمات أخرى", icon: "sparkles", slug: "other" }
];

const demoServices: ProviderService[] = [
  { id: "demo-1", provider_id: "demo-p1", category_id: "computer", title: "صيانة كمبيوتر ولابتوب", description: "تشخيص الأعطال وتثبيت البرامج وتنظيف الأجهزة. بطاقة تجريبية غير موثقة.", city: "صنعاء", price_text: "السعر بعد معرفة المشكلة", is_active: true, profiles: { id: "demo-p1", full_name: "مركز التقنية (تجريبي)", role: "provider", city: "صنعاء", phone: null, avatar_url: null, provider_approved: false }, categories: fallbackCategories[0] },
  { id: "demo-2", provider_id: "demo-p2", category_id: "design", title: "تصميم جرافيكي", description: "تصميم منشورات وإعلانات للمشاريع الصغيرة. بطاقة تجريبية.", city: "صنعاء", price_text: "حسب نوع التصميم", is_active: true, profiles: { id: "demo-p2", full_name: "لمسة إبداع (تجريبي)", role: "provider", city: "صنعاء", phone: null, avatar_url: null, provider_approved: false }, categories: fallbackCategories[3] },
  { id: "demo-3", provider_id: "demo-p3", category_id: "education", title: "دروس خصوصية", description: "مراجعة دروس ومساعدة في التحضير للاختبارات. تحقق من المؤهلات قبل الاتفاق.", city: "صنعاء", price_text: "حسب المادة والمرحلة", is_active: true, profiles: { id: "demo-p3", full_name: "معلم خصوصي (تجريبي)", role: "provider", city: "صنعاء", phone: null, avatar_url: null, provider_approved: false }, categories: fallbackCategories[4] },
  { id: "demo-4", provider_id: "demo-p4", category_id: "mobile", title: "صيانة وإعداد الجوالات", description: "مساعدة في إعداد الأجهزة وحل بعض مشاكل البرامج. بطاقة تجريبية.", city: "صنعاء", price_text: "بعد فحص الجهاز", is_active: true, profiles: { id: "demo-p4", full_name: "حلول الجوال (تجريبي)", role: "provider", city: "صنعاء", phone: null, avatar_url: null, provider_approved: false }, categories: fallbackCategories[1] }
];

type Notice = { type: "success" | "error" | "info"; text: string };
type Tab = "home" | "requests" | "profile";

function categoryIcon(icon: string) {
  const props = { size: 22, strokeWidth: 1.8 };
  if (icon === "laptop") return <Laptop {...props} />;
  if (icon === "mobile") return <Smartphone {...props} />;
  if (icon === "palette") return <Palette {...props} />;
  if (icon === "book") return <BookOpen {...props} />;
  if (icon === "camera") return <Camera {...props} />;
  if (icon === "sparkles") return <Sparkles {...props} />;
  return <Wrench {...props} />;
}

const statusLabels: Record<string, string> = {
  pending: "بانتظار الرد", accepted: "تم القبول", in_progress: "قيد التنفيذ",
  completed: "مكتمل", cancelled: "ملغي", rejected: "مرفوض"
};

export default function App() {
  const [sessionUser, setSessionUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories);
  const [services, setServices] = useState<ProviderService[]>(demoServices);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [modal, setModal] = useState<"auth" | "service" | "request" | "none">("none");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedService, setSelectedService] = useState<ProviderService | null>(null);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", role: "customer", city: "صنعاء", phone: "" });
  const [serviceForm, setServiceForm] = useState({ title: "", category_id: "computer", description: "", city: "صنعاء", price_text: "" });
  const [requestForm, setRequestForm] = useState({ details: "", city: "صنعاء", preferred_date: "" });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) setSessionUser({ id: user.id, email: user.email });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setSessionUser(user ? { id: user.id, email: user.email } : null);
      if (!user) setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void loadPublicData();
  }, []);

  useEffect(() => {
    if (sessionUser && supabase) void loadProfileAndRequests(sessionUser.id);
  }, [sessionUser?.id]);

  async function loadPublicData() {
    if (!supabase) return;
    const [catResult, serviceResult] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      supabase.from("provider_services").select("*, profiles!provider_services_provider_id_fkey(*), categories(*)").eq("is_active", true).order("created_at", { ascending: false })
    ]);
    if (!catResult.error && catResult.data?.length) setCategories(catResult.data as Category[]);
    if (!serviceResult.error) setServices((serviceResult.data || []) as ProviderService[]);
  }

  async function loadProfileAndRequests(userId: string) {
    if (!supabase) return;
    const { data: p } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (p) setProfile(p as Profile);
    const { data: r } = await supabase.from("service_requests").select("*, provider_services(*)").or(`customer_id.eq.${userId},provider_id.eq.${userId}`).order("created_at", { ascending: false });
    setRequests((r || []) as ServiceRequest[]);
  }

  const filteredServices = useMemo(() => services.filter(s => {
    const cName = s.categories?.name || categories.find(c => c.id === s.category_id)?.name || "";
    const providerName = s.profiles?.full_name || "";
    const haystack = `${s.title} ${s.description} ${s.city} ${cName} ${providerName}`.toLowerCase();
    return (selectedCategory === "all" || s.category_id === selectedCategory)
      && (!query || haystack.includes(query.toLowerCase()))
      && (!city || s.city.toLowerCase().includes(city.toLowerCase()));
  }), [services, selectedCategory, query, city, categories]);

  function notify(text: string, type: Notice["type"] = "info") {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 4500);
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return notify("اربط Supabase أولًا باتباع ملف README_AR.md.", "error");
    setLoading(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authForm.email.trim(),
          password: authForm.password,
          options: { data: { full_name: authForm.name.trim(), requested_role: authForm.role, city: authForm.city.trim(), phone: authForm.phone.trim() } }
        });
        if (error) throw error;
        if (data.session) {
          notify("تم إنشاء الحساب. أكمل بيانات ملفك الشخصي.", "success");
          setModal("none");
        } else {
          notify("تم إرسال طلب التسجيل. تحقق من بريدك الإلكتروني إذا كان تأكيد البريد مفعّلًا.", "success");
          setModal("none");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authForm.email.trim(), password: authForm.password });
        if (error) throw error;
        notify("تم تسجيل الدخول.", "success");
        setModal("none");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "تعذر إكمال العملية.", "error");
    } finally { setLoading(false); }
  }

  async function handleSignOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) notify(error.message, "error");
    else { setRequests([]); setProfile(null); setTab("home"); notify("تم تسجيل الخروج.", "success"); }
  }

  async function handleCreateService(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !sessionUser) {
      notify("يلزم ربط قاعدة البيانات وتسجيل الدخول لإضافة خدمة حقيقية.", "error"); return;
    }
    if (profile?.role !== "provider") {
      notify("يجب أن يكون حسابك من نوع مقدم خدمة. سجّل خروجًا وأنشئ حساب مقدم خدمة إذا لزم.", "error"); return;
    }
    setLoading(true);
    const { error } = await supabase.from("provider_services").insert({
      provider_id: sessionUser.id, category_id: serviceForm.category_id,
      title: serviceForm.title.trim(), description: serviceForm.description.trim(),
      city: serviceForm.city.trim(), price_text: serviceForm.price_text.trim(), is_active: true
    });
    setLoading(false);
    if (error) return notify(error.message, "error");
    setModal("none"); setServiceForm({ title: "", category_id: categories[0]?.id || "", description: "", city: profile.city || "صنعاء", price_text: "" });
    await loadPublicData(); notify("تمت إضافة الخدمة.", "success");
  }

  async function handleCreateRequest(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !sessionUser || !selectedService) {
      notify("لتقديم طلب حقيقي، اربط قاعدة البيانات وسجّل الدخول.", "error"); return;
    }
    if (profile?.role !== "customer") return notify("سجّل الدخول بحساب عميل لتقديم طلب.", "error");
    if (selectedService.provider_id === sessionUser.id) return notify("لا يمكنك طلب خدمتك الخاصة.", "error");
    setLoading(true);
    const { error } = await supabase.from("service_requests").insert({
      customer_id: sessionUser.id, provider_id: selectedService.provider_id, service_id: selectedService.id,
      details: requestForm.details.trim(), city: requestForm.city.trim(),
      preferred_date: requestForm.preferred_date || null, status: "pending"
    });
    setLoading(false);
    if (error) return notify(error.message, "error");
    setModal("none"); setSelectedService(null); setRequestForm({ details: "", city: profile.city || "صنعاء", preferred_date: "" });
    await loadProfileAndRequests(sessionUser.id); notify("تم إرسال الطلب إلى مقدم الخدمة.", "success");
  }

  async function updateRequestStatus(req: ServiceRequest, status: ServiceRequest["status"]) {
    if (!supabase || !sessionUser) return;
    const { error } = await supabase.from("service_requests").update({ status }).eq("id", req.id);
    if (error) return notify(error.message, "error");
    await loadProfileAndRequests(sessionUser.id);
    notify("تم تحديث حالة الطلب.", "success");
  }

  function startRequest(service: ProviderService) {
    if (!sessionUser) {
      setSelectedService(service); setAuthMode("login"); setModal("auth");
      notify("سجّل الدخول أولًا ثم أكمل طلب الخدمة.", "info"); return;
    }
    setSelectedService(service);
    setRequestForm({ details: "", city: profile?.city || service.city || "صنعاء", preferred_date: "" });
    setModal("request");
  }

  const isLive = isSupabaseConfigured;
  const canOfferService = profile?.role === "provider";
  const isAdmin = profile?.role === "admin";

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
        <span className="brand-mark"><Wrench size={25} /></span><span>خدمني<small>خدمات أقرب وأسهل</small></span>
      </a>
      <nav className="desktop-nav">
        <button className={tab === "home" ? "nav-link active" : "nav-link"} onClick={() => setTab("home")}>الرئيسية</button>
        {sessionUser && <button className={tab === "requests" ? "nav-link active" : "nav-link"} onClick={() => setTab("requests")}>طلباتي</button>}
        {isAdmin && <span className="admin-pill"><ShieldCheck size={14}/> مدير</span>}
      </nav>
      <div className="top-actions">
        {sessionUser ? <>
          <button className="profile-chip" onClick={() => setTab("profile")}><UserRound size={17}/><span>{profile?.full_name || sessionUser.email || "حسابي"}</span></button>
          <button className="icon-btn" title="تسجيل الخروج" onClick={handleSignOut}><LogOut size={18}/></button>
        </> : <button className="primary-btn small-btn" onClick={() => { setAuthMode("signup"); setModal("auth"); }}>دخول / حساب جديد</button>}
        <button className="icon-btn mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="القائمة">{mobileMenu ? <X/> : <Menu/>}</button>
      </div>
    </header>

    {mobileMenu && <div className="mobile-menu">
      <button onClick={() => { setTab("home"); setMobileMenu(false); }}>الرئيسية</button>
      {sessionUser && <button onClick={() => { setTab("requests"); setMobileMenu(false); }}>طلباتي</button>}
      {sessionUser && <button onClick={() => { setTab("profile"); setMobileMenu(false); }}>حسابي</button>}
    </div>}

    {!isLive && <div className="setup-banner"><AlertCircle size={18}/><div><strong>وضع المعاينة</strong><span>تعرض هذه الصفحة أمثلة. لتفعيل التسجيل والطلبات الحقيقية، اربط مشروع Supabase حسب الدليل.</span></div></div>}

    {tab === "home" && <>
      <main>
        <section className="hero">
          <div className="hero-text"><span className="eyebrow"><Sparkles size={14}/> منصتك للخدمات المحلية</span>
            <h1>تحتاج خدمة؟<br/><span>نساعدك تلاقيها.</span></h1>
            <p>ابحث عن مقدمي الخدمات، قارن تفاصيلهم، وأرسل طلبك من مكان واحد.</p>
            <div className="hero-stats"><div><strong>{isLive ? services.length : "—"}</strong><span>خدمة معروضة</span></div><div><strong>8</strong><span>تصنيفات متنوعة</span></div><div><strong>24/7</strong><span>تصفح المنصة</span></div></div>
          </div>
          <div className="hero-art"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="hero-tool"><Wrench size={72}/></div><div className="float-card card-a"><CheckCircle2 size={18}/><span>خدمة تناسبك</span></div><div className="float-card card-b"><Star size={18}/><span>خيارات متعددة</span></div></div>
          <div className="search-panel">
            <label className="search-field"><Search size={21}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ما الخدمة التي تبحث عنها؟"/></label>
            <label className="search-field city-field"><MapPin size={20}/><input value={city} onChange={e => setCity(e.target.value)} placeholder="المدينة أو المنطقة"/></label>
            <button className="primary-btn search-button" onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}>ابحث الآن <ArrowRight size={17}/></button>
          </div>
        </section>

        <section className="section categories-section">
          <div className="section-heading"><div><span className="eyebrow">اختر ما تحتاجه</span><h2>تصفح حسب التصنيف</h2></div><button className="text-btn" onClick={() => setSelectedCategory("all")}>كل التصنيفات <ArrowRight size={15}/></button></div>
          <div className="categories-grid">
            {categories.map(c => <button key={c.id} className={`category-card ${selectedCategory === c.id ? "selected" : ""}`} onClick={() => { setSelectedCategory(selectedCategory === c.id ? "all" : c.id); document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className="category-icon">{categoryIcon(c.icon)}</span><strong>{c.name}</strong><span className="category-arrow"><ArrowRight size={15}/></span>
            </button>)}
          </div>
        </section>

        <section className="section services-section" id="services">
          <div className="section-heading"><div><span className="eyebrow">اكتشف خدمات</span><h2>{selectedCategory === "all" ? "خدمات قد تهمك" : categories.find(c => c.id === selectedCategory)?.name}</h2></div><span className="results-count">{filteredServices.length} نتيجة</span></div>
          <div className="services-grid">
            {filteredServices.map(s => <article className="service-card" key={s.id}>
              <div className="service-card-top"><span className="service-illustration">{categoryIcon(s.categories?.icon || categories.find(c => c.id === s.category_id)?.icon || "tools")}</span><span className="service-tag">{s.categories?.name || categories.find(c => c.id === s.category_id)?.name || "خدمة"}</span></div>
              <h3>{s.title}</h3><p className="service-provider"><UserRound size={15}/>{s.profiles?.full_name || "مقدم خدمة"}</p><p className="service-description">{s.description}</p>
              <div className="service-bottom"><span className="service-city"><MapPin size={14}/>{s.city}</span><strong>{s.price_text || "حسب الاتفاق"}</strong></div>
              <button className="primary-btn full-btn" onClick={() => startRequest(s)}>اطلب الخدمة <ArrowRight size={16}/></button>
              {(!isLive || s.id.startsWith("demo-")) && <span className="demo-label">مثال تجريبي</span>}
            </article>)}
          </div>
          {filteredServices.length === 0 && <div className="empty-state"><Search size={34}/><h3>لا توجد نتائج مطابقة</h3><p>جرّب تغيير كلمة البحث أو التصنيف أو المنطقة.</p><button className="secondary-btn" onClick={() => { setQuery(""); setCity(""); setSelectedCategory("all"); }}>مسح الفلاتر</button></div>}
        </section>

        <section className="join-section"><div className="join-symbol"><BriefcaseBusiness size={30}/></div><div><span className="eyebrow">هل تقدم خدمة؟</span><h2>خلّ العملاء يلاقوك بسهولة</h2><p>أنشئ حساب مقدم خدمة وأضف خدماتك وأسعارك ومناطق عملك.</p></div><button className="light-btn" onClick={() => { if (!sessionUser) { setAuthForm({ ...authForm, role: "provider" }); setAuthMode("signup"); setModal("auth"); } else if (canOfferService) { setModal("service"); } else notify("هذا الحساب ليس حساب مقدم خدمة. أنشئ حسابًا منفصلًا للدور المناسب.", "info"); }}>{canOfferService ? "أضف خدمة جديدة" : "ابدأ كمقدم خدمة"} <ArrowRight size={17}/></button></section>
        <section className="trust-row"><div><ShieldCheck size={23}/><div><strong>خصوصية وصلاحيات</strong><span>تُحمى البيانات وفق إعدادات قاعدة البيانات</span></div></div><div><ClipboardList size={23}/><div><strong>تابع طلباتك</strong><span>اعرف حالة طلب الخدمة بعد تسجيل الدخول</span></div></div><div><Star size={23}/><div><strong>تقييم بعد الإنجاز</strong><span>يمكن تفعيل التقييمات للطلبات المكتملة</span></div></div></section>
      </main>
    </>}

    {tab === "requests" && <main className="dashboard-page"><div className="section-heading"><div><span className="eyebrow">حسابك</span><h2>إدارة الطلبات</h2></div><button className="secondary-btn" onClick={() => setTab("home")}>العودة للخدمات</button></div>
      {!sessionUser ? <div className="empty-state"><UserRound size={35}/><h3>سجّل الدخول أولًا</h3><button className="primary-btn" onClick={() => { setAuthMode("login"); setModal("auth"); }}>تسجيل الدخول</button></div> : <div className="request-list">
        {requests.map(r => <article className="request-row" key={r.id}><div className="request-row-icon"><ClipboardList/></div><div className="request-row-main"><strong>{r.provider_services?.title || "طلب خدمة"}</strong><p>{r.details}</p><small>المدينة: {r.city} · {new Date(r.created_at).toLocaleDateString("ar-YE")}</small></div><span className={`status status-${r.status}`}>{statusLabels[r.status] || r.status}</span>
          {profile?.role === "provider" && r.provider_id === sessionUser.id && <div className="request-controls">{r.status === "pending" && <><button className="primary-btn small-btn" onClick={() => updateRequestStatus(r, "accepted")}>قبول</button><button className="secondary-btn small-btn" onClick={() => updateRequestStatus(r, "rejected")}>رفض</button></>}{r.status === "accepted" && <button className="primary-btn small-btn" onClick={() => updateRequestStatus(r, "in_progress")}>بدء التنفيذ</button>}{r.status === "in_progress" && <button className="primary-btn small-btn" onClick={() => updateRequestStatus(r, "completed")}>إكمال الطلب</button>}</div>}
        </article>)}
        {requests.length === 0 && <div className="empty-state"><ClipboardList size={35}/><h3>لا توجد طلبات بعد</h3><p>ستظهر الطلبات هنا بعد استخدام المنصة المرتبطة بقاعدة البيانات.</p><button className="primary-btn" onClick={() => setTab("home")}>تصفح الخدمات</button></div>}
      </div>}
    </main>}

    {tab === "profile" && <main className="dashboard-page"><div className="section-heading"><div><span className="eyebrow">إعدادات الحساب</span><h2>حسابي</h2></div></div>
      {!sessionUser ? <div className="empty-state"><UserRound size={35}/><h3>لا يوجد حساب مسجل</h3><button className="primary-btn" onClick={() => { setAuthMode("signup"); setModal("auth"); }}>إنشاء حساب</button></div> : <div className="profile-panel"><div className="profile-avatar"><UserRound size={34}/></div><h3>{profile?.full_name || "حساب جديد"}</h3><p>{sessionUser.email}</p><span className="role-badge">{profile?.role === "provider" ? "مقدم خدمة" : profile?.role === "admin" ? "مدير النظام" : "عميل"}</span><div className="profile-details"><div><span>المدينة</span><strong>{profile?.city || "لم تحدد"}</strong></div><div><span>حالة الحساب</span><strong>{profile?.provider_approved ? "تمت الموافقة" : profile?.role === "provider" ? "بانتظار المراجعة" : "نشط"}</strong></div></div><button className="secondary-btn" onClick={handleSignOut}><LogOut size={17}/> تسجيل الخروج</button></div>}
    </main>}

    <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><Wrench size={20}/></span><span>خدمني<small>خدمات أقرب وأسهل</small></span></a><p>منصة تجريبية للخدمات المحلية. تحقق من مقدم الخدمة قبل الاتفاق أو الدفع.</p><div><a href="#privacy" onClick={e => { e.preventDefault(); notify("أضف سياسة الخصوصية النهائية قبل النشر التجاري.", "info"); }}>الخصوصية</a><a href="#terms" onClick={e => { e.preventDefault(); notify("أضف شروط الاستخدام النهائية قبل النشر التجاري.", "info"); }}>شروط الاستخدام</a></div><small>© {new Date().getFullYear()} خدمني</small></footer>

    <nav className="bottom-nav"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><Search size={20}/>الرئيسية</button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><ClipboardList size={20}/>طلباتي</button><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><UserRound size={20}/>حسابي</button></nav>

    {notice && <div className={`toast toast-${notice.type}`}><span>{notice.type === "error" ? <AlertCircle size={19}/> : notice.type === "success" ? <CheckCircle2 size={19}/> : <AlertCircle size={19}/>}</span>{notice.text}<button onClick={() => setNotice(null)}><X size={16}/></button></div>}

    {modal !== "none" && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal("none"); }}>
      <section className="modal">
        <button className="modal-close" onClick={() => setModal("none")} aria-label="إغلاق"><X/></button>
        {modal === "auth" && <><div className="modal-heading"><span className="modal-icon"><UserRound size={25}/></span><h2>{authMode === "signup" ? "أنشئ حسابك" : "مرحبًا بعودتك"}</h2><p>{authMode === "signup" ? "انضم إلى خدمني وابدأ باستخدام المنصة." : "سجّل الدخول لمتابعة طلباتك."}</p></div>
          <form className="form" onSubmit={handleAuth}>
            {authMode === "signup" && <><label>الاسم الكامل<input required maxLength={80} value={authForm.name} onChange={e => setAuthForm({ ...authForm, name: e.target.value })} placeholder="اكتب اسمك"/></label>
              <label>نوع الحساب<select value={authForm.role} onChange={e => setAuthForm({ ...authForm, role: e.target.value })}><option value="customer">عميل</option><option value="provider">مقدم خدمة</option></select></label>
              <label>المدينة<input required value={authForm.city} onChange={e => setAuthForm({ ...authForm, city: e.target.value })} placeholder="مثلاً صنعاء"/></label>
              <label>رقم الهاتف (اختياري)<input inputMode="tel" value={authForm.phone} onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} placeholder="رقم للتواصل"/></label></>}
            <label>البريد الإلكتروني<input required type="email" value={authForm.email} onChange={e => setAuthForm({ ...authForm, email: e.target.value })} placeholder="name@example.com" autoComplete="email"/></label>
            <label>كلمة المرور<input required minLength={8} type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} placeholder="8 أحرف على الأقل" autoComplete={authMode === "signup" ? "new-password" : "current-password"}/></label>
            <button className="primary-btn full-btn" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18}/> : null}{authMode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول"}</button>
          </form>
          <p className="switch-auth">{authMode === "signup" ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟"} <button onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}>{authMode === "signup" ? "سجّل الدخول" : "أنشئ حسابًا"}</button></p>
          {!isLive && <p className="inline-warning">التسجيل الفعلي يحتاج إعداد Supabase أولًا.</p>}
        </>}
        {modal === "service" && <><div className="modal-heading"><span className="modal-icon"><BriefcaseBusiness size={25}/></span><h2>أضف خدمة جديدة</h2><p>ستظهر الخدمة للزوار بعد حفظها.</p></div><form className="form" onSubmit={handleCreateService}>
          <label>اسم الخدمة<input required maxLength={100} value={serviceForm.title} onChange={e => setServiceForm({ ...serviceForm, title: e.target.value })} placeholder="مثلاً صيانة اللابتوب"/></label>
          <label>التصنيف<select required value={serviceForm.category_id} onChange={e => setServiceForm({ ...serviceForm, category_id: e.target.value })}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>وصف الخدمة<textarea required maxLength={1000} rows={3} value={serviceForm.description} onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })} placeholder="اشرح الخدمة التي تقدمها"/></label>
          <label>المدينة<input required value={serviceForm.city} onChange={e => setServiceForm({ ...serviceForm, city: e.target.value })}/></label>
          <label>السعر التقريبي<input maxLength={100} value={serviceForm.price_text} onChange={e => setServiceForm({ ...serviceForm, price_text: e.target.value })} placeholder="مثلاً يبدأ من 3000 ريال"/></label>
          <button className="primary-btn full-btn" disabled={loading}>{loading ? "جارٍ الحفظ..." : "نشر الخدمة"}</button>
        </form></>}
        {modal === "request" && selectedService && <><div className="modal-heading"><span className="modal-icon"><ClipboardList size={25}/></span><h2>طلب خدمة</h2><p>{selectedService.title} — {selectedService.profiles?.full_name}</p></div><form className="form" onSubmit={handleCreateRequest}>
          <label>تفاصيل الطلب<textarea required maxLength={1200} rows={4} value={requestForm.details} onChange={e => setRequestForm({ ...requestForm, details: e.target.value })} placeholder="اشرح ما تحتاجه بالتحديد"/></label>
          <label>المدينة / المنطقة<input required maxLength={100} value={requestForm.city} onChange={e => setRequestForm({ ...requestForm, city: e.target.value })}/></label>
          <label>الموعد المناسب (اختياري)<input type="date" value={requestForm.preferred_date} onChange={e => setRequestForm({ ...requestForm, preferred_date: e.target.value })}/></label>
          <button className="primary-btn full-btn" disabled={loading}>{loading ? "جارٍ إرسال الطلب..." : "إرسال الطلب"}</button>
        </form></>}
      </section>
    </div>}
  </div>;
}
