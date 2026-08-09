import { useState, useEffect, useRef } from "react";
import GlobalStyles from "./styles/GlobalStyles";
import LoginScreen            from "./screens/LoginScreen";
import RegisterScreen         from "./screens/RegisterScreen";
import DashboardScreen        from "./screens/DashboardScreen";
import PertaminaDashboard     from "./screens/PertaminaDashboard";
import FormScreen             from "./screens/FormScreen";
import RiwayatScreen          from "./screens/RiwayatScreen";
import MaintenanceScreen      from "./screens/MaintenanceScreen";
import DetailScreen           from "./screens/DetailScreen";
import TugasDetailScreen      from "./screens/TugasDetailScreen";
import DetailKategoriScreen   from "./screens/DetailKategoriScreen";
import FilteredInspeksiScreen from "./screens/FilteredInspeksiScreen";
import ForgotPasswordScreen   from "./screens/ForgotPasswordScreen";
import ResetPasswordScreen    from "./screens/ResetPasswordScreen";
import RiwayatKerusakanScreen from "./screens/RiwayatKerusakanScreen";
import DetailHSEScreen        from "./screens/DetailHSEScreen";
import DetailP1Screen         from "./screens/DetailP1Screen";
import ExportScreen           from "./screens/ExportScreen";
import AdminKendaraanScreen   from "./screens/AdminKendaraanScreen";
import { supabase }           from "./lib/supabase";
import { useBreakpoint }      from "./hooks/useBreakpoint";
import { MOBILE_MAX_WIDTH, DESKTOP_CONTENT_MAX_WIDTH } from "./styles/layout";
import theme from "./styles/theme";
import { ThemeProvider } from "./context/ThemeContext";
import { hasOpenInternalView } from "./hooks/internalViewFlag";

// Helper normalisasi role — import dari BottomNav supaya konsisten
import { isTeknisi, isDepot, isHSE, isP1 } from "./components/BottomNav";

import HSEDashboard        from "./screens/HSEDashboard";
import HSEFormScreen       from "./screens/HSEFormScreen";
import HSETindakLanjut     from "./screens/HSETindakLanjut";
import P1Dashboard         from "./screens/P1Dashboard";
import P1FormScreen        from "./screens/P1FormScreen";
import P1TindakLanjut      from "./screens/P1TindakLanjut";
import TeknisiTindakLanjut from "./screens/TeknisiTindakLanjut";
import "./styles/animations.css";

const AppInner = () => {
  const [screen, setScreen]                     = useState("login");
  const [role, setRole]                         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [selectedInspeksiId, setSelectedInspeksiId] = useState(null);
  const [selectedTugasId, setSelectedTugasId]   = useState(null);
  const [detailKategoriType,  setDetailKategoriType]  = useState(null);
  const [detailKategoriValue, setDetailKategoriValue] = useState(null);
  const [filteredInspFilter,  setFilteredInspFilter]  = useState(null);
  const [selectedHSEId, setSelectedHSEId]       = useState(null);
  const [selectedP1Id, setSelectedP1Id]         = useState(null);
  const [depotActiveTab, setDepotActiveTab]     = useState("gps");
  const [initialTab, setInitialTab]             = useState("beranda");
  const [showExitConfirm, setShowExitConfirm]   = useState(false);
  const isDesktop = useBreakpoint();

  const screenRef    = useRef(screen);
  const allowExitRef = useRef(false);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // Normalisasi role dari DB → role baru
  const normalizeRole = (r) => {
    if (r === "transportir" || r === "mekanik") return "teknisi";
    if (r === "pertamina") return "depot";
    return r; // "teknisi" | "depot" | "hse" | "p1" langsung
  };

  const fetchRoleAndNavigate = async (userId) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      await supabase.auth.signOut();
      enterLogin();
      setRole(null);
      return;
    }

    const normalized = normalizeRole(profile.role);
    setRole(normalized);
    enterDashboard();
  };

  const enterDashboard = () => {
    window.history.replaceState({ screen: "dashboard" }, "");
    window.history.pushState({ screen: "dashboard", guard: true }, "");
    setScreen("dashboard");
  };

  const enterLogin = () => {
    window.history.replaceState({ screen: "login" }, "");
    setScreen("login");
  };

  useEffect(() => {
    const checkSession = async () => {
      const urlParams  = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace("#", "?").slice(1));
      const isRecovery =
        urlParams.get("screen") === "reset-password" ||
        hashParams.get("type") === "recovery";

      if (isRecovery) {
        window.history.replaceState({ screen: "reset-password" }, "");
        setScreen("reset-password");
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetchRoleAndNavigate(session.user.id);
      } else {
        window.history.replaceState({ screen: "login" }, "");
      }
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        enterLogin();
        setRole(null);
        setSelectedInspeksiId(null);
        setSelectedTugasId(null);
        setSelectedHSEId(null);
        setSelectedP1Id(null);
        setDepotActiveTab("gps");
      }
      if (event === "PASSWORD_RECOVERY") {
        window.history.replaceState({ screen: "reset-password" }, "");
        setScreen("reset-password");
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN" && session) {
        if (screenRef.current === "reset-password") return;
        const alreadyInApp = !["login", "register"].includes(screenRef.current);
        if (alreadyInApp) return;
        await fetchRoleAndNavigate(session.user.id);
      }
    });

    return () => subscription?.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handlePopState = (event) => {
      const state = event.state;
      const incomingScreen = state?.screen;
      if (!incomingScreen) return;

      if (allowExitRef.current) {
        if (incomingScreen === "dashboard" && screenRef.current === "dashboard") {
          window.history.back();
        }
        return;
      }

      if (incomingScreen === "dashboard" && screenRef.current === "dashboard") {
        // Kalau ada tampilan internal (mis. daftar kendaraan di HSEDashboard,
        // lightbox foto, dsb.) yang lagi kebuka lewat useBackableView, popstate
        // ini sebenarnya cuma menutup tampilan itu — BUKAN usaha keluar dari
        // aplikasi. Biarkan hook internal yang menangani, jangan tampilkan
        // dialog konfirmasi keluar di sini.
        if (hasOpenInternalView()) return;

        window.history.pushState({ screen: "dashboard", guard: true }, "");
        setShowExitConfirm(true);
        return;
      }

      setScreen(incomingScreen);
      if (state && "selectedInspeksiId"  in state) setSelectedInspeksiId(state.selectedInspeksiId ?? null);
      if (state && "selectedTugasId"     in state) setSelectedTugasId(state.selectedTugasId ?? null);
      if (state && "detailKategoriType"  in state) setDetailKategoriType(state.detailKategoriType ?? null);
      if (state && "detailKategoriValue" in state) setDetailKategoriValue(state.detailKategoriValue ?? null);
      if (state && "filteredInspFilter"  in state) setFilteredInspFilter(state.filteredInspFilter ?? null);
      if (state && "selectedHSEId"       in state) setSelectedHSEId(state.selectedHSEId ?? null);
      if (state && "selectedP1Id"        in state) setSelectedP1Id(state.selectedP1Id ?? null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const confirmExit = () => {
    setShowExitConfirm(false);
    allowExitRef.current = true;
    window.history.back();
  };

  const cancelExit = () => setShowExitConfirm(false);

  const handleLogin  = (r) => { setRole(normalizeRole(r)); enterDashboard(); };
  const handleLogout = async () => { await supabase.auth.signOut(); };

  const nav = (s) => {
    if (s === "dashboard-tugas") {
      setScreen("dashboard");
      setInitialTab("tugas");
    } else if (s === "dashboard") {
      enterDashboard();
    } else {
      setInitialTab("beranda");
      window.history.pushState({ screen: s }, "");
      setScreen(s);
    }
  };

  const openDetail = (id) => {
    setSelectedInspeksiId(id);
    window.history.pushState({ screen: "detail", selectedInspeksiId: id }, "");
    setScreen("detail");
  };

  const openTugas = (id) => {
    setSelectedTugasId(id);
    window.history.pushState({ screen: "tugas-detail", selectedTugasId: id }, "");
    setScreen("tugas-detail");
  };

  const openKategori = (filterType, filterValue) => {
    setDetailKategoriType(filterType);
    setDetailKategoriValue(filterValue);
    window.history.pushState(
      { screen: "detail-kategori", detailKategoriType: filterType, detailKategoriValue: filterValue },
      ""
    );
    setScreen("detail-kategori");
  };

  const openFilteredInspeksi = (filterType) => {
    setFilteredInspFilter(filterType);
    window.history.pushState(
      { screen: "filtered-inspeksi", filteredInspFilter: filterType },
      ""
    );
    setScreen("filtered-inspeksi");
  };

  const openDetailHSE = (id) => {
    setSelectedHSEId(id);
    window.history.pushState({ screen: "detail-hse", selectedHSEId: id }, "");
    setScreen("detail-hse");
  };

  const openDetailP1 = (id) => {
    setSelectedP1Id(id);
    window.history.pushState({ screen: "detail-p1", selectedP1Id: id }, "");
    setScreen("detail-p1");
  };

  // ── Render dashboard sesuai role ──────────────────────────────────────
  const renderDashboard = () => {
    if (isDepot(role)) {
      return (
        <PertaminaDashboard
          onNav={nav}
          onLogout={handleLogout}
          onOpenDetail={openDetail}
          onOpenKategori={openKategori}
          onOpenDetailHSE={openDetailHSE}
          onOpenDetailP1={openDetailP1}
          activeTab={depotActiveTab}
          onChangeTab={setDepotActiveTab}
        />
      );
    }
    if (isHSE(role)) {
      return <HSEDashboard role={role} onNav={nav} onLogout={handleLogout} />;
    }
    if (isP1(role)) {
      return <P1Dashboard role={role} onNav={nav} onLogout={handleLogout} />;
    }
    // Default: teknisi
    return (
      <DashboardScreen
        role={role}
        onNav={nav}
        onLogout={handleLogout}
        onOpenDetail={openDetail}
        onOpenTugas={openTugas}
        initialTab={initialTab}
        onOpenKategori={openFilteredInspeksi}
      />
    );
  };

  // ── Render form pengecekan sesuai role ────────────────────────────────
  const renderForm = () => {
    if (isHSE(role)) {
      return <HSEFormScreen onBack={() => window.history.back()} onNav={nav} />;
    }
    if (isP1(role)) {
      return <P1FormScreen onBack={() => window.history.back()} onNav={nav} />;
    }
    // Default: teknisi
    return <FormScreen onBack={() => window.history.back()} onNav={nav} />;
  };

  // ── Render tindak lanjut sesuai role ──────────────────────────────────
  const renderTindakLanjut = () => {
    if (isHSE(role)) {
      return <HSETindakLanjut onBack={() => window.history.back()} onNav={nav} />;
    }
    if (isP1(role)) {
      return <P1TindakLanjut onBack={() => window.history.back()} onNav={nav} />;
    }
    // Default: teknisi
    return <TeknisiTindakLanjut onBack={() => window.history.back()} onNav={nav} />;
  };

  const containerStyle = {
    fontFamily: "'DM Sans', sans-serif",
    background: "#F8FAFC",
    minHeight: "100vh",
    width: "100%",
    maxWidth: isDesktop ? "none" : MOBILE_MAX_WIDTH,
    margin: isDesktop ? 0 : "0 auto",
  };

  if (loading) {
    return (
      <div style={{ ...containerStyle, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14, color: "#64748B" }}>Memuat aplikasi...</div>
        </div>
      </div>
    );
  }

  const knownScreens = [
    "login", "register", "dashboard",
    "form", "tindak-lanjut",
    "history", "maintenance", "export",
    "detail", "tugas-detail",
    "riwayat-kerusakan", "detail-kategori", "filtered-inspeksi",
    "forgot-password", "reset-password",
    "detail-hse", "detail-p1",
    "admin-kendaraan",
  ];
  const safeScreen = knownScreens.includes(screen) ? screen : "login";

  // Layar-layar berikut merender <BottomNav/> yang otomatis jadi sidebar kiri
  // di desktop (lihat BottomNav.jsx). Untuk layar itu JANGAN dipusatkan lagi
  // di sini — biarkan masing-masing screen mengatur marginLeft-nya sendiri,
  // supaya tidak dobel dengan offset sidebar.
  const sidebarScreens = ["dashboard", "history", "maintenance", "export"];
  if (safeScreen === "tindak-lanjut" && (isTeknisi(role) || isHSE(role))) {
    sidebarScreens.push("tindak-lanjut"); // P1TindakLanjut tidak pakai BottomNav bersama, jadi dikecualikan
  }
  const hasSidebar = isDesktop && sidebarScreens.includes(safeScreen);

  const innerStyle = isDesktop && !hasSidebar
    ? { maxWidth: DESKTOP_CONTENT_MAX_WIDTH, margin: "0 auto", width: "100%" }
    : undefined;

  return (
    <div style={containerStyle}>
      <GlobalStyles />
      <div style={innerStyle}>
        {safeScreen === "login"          && <LoginScreen onLogin={handleLogin} onGoRegister={() => nav("register")} onForgotPassword={() => setScreen("forgot-password")} />}
        {safeScreen === "register"       && <RegisterScreen onBack={() => window.history.back()} />}
        {safeScreen === "dashboard"      && renderDashboard()}
        {safeScreen === "form"           && renderForm()}
        {safeScreen === "tindak-lanjut"  && renderTindakLanjut()}
        {safeScreen === "history"        && (
          <RiwayatScreen
            role={role}
            onNav={nav}
            onOpenDetail={openDetail}
            onOpenDetailHSE={openDetailHSE}
            onOpenDetailP1={openDetailP1}
            category={isDepot(role) ? depotActiveTab : undefined}
          />
        )}
        {safeScreen === "maintenance"    && <MaintenanceScreen role={role} onNav={nav} />}
        {safeScreen === "export"         && <ExportScreen onNav={nav} onBack={() => window.history.back()} />}
        {safeScreen === "admin-kendaraan" && <AdminKendaraanScreen role={role} onNav={nav} onBack={() => window.history.back()} />}
        {safeScreen === "detail"         && <DetailScreen inspeksiId={selectedInspeksiId} onBack={() => window.history.back()} />}
        {safeScreen === "tugas-detail"   && <TugasDetailScreen tugasId={selectedTugasId} onBack={() => window.history.back()} />}
        {safeScreen === "riwayat-kerusakan" && <RiwayatKerusakanScreen onBack={() => window.history.back()} />}
        {safeScreen === "detail-kategori" && (
          <DetailKategoriScreen
            filterType={detailKategoriType}
            filterValue={detailKategoriValue}
            onBack={() => window.history.back()}
            onOpenDetail={openDetail}
          />
        )}
        {safeScreen === "filtered-inspeksi" && (
          <FilteredInspeksiScreen
            filterType={filteredInspFilter}
            onBack={() => window.history.back()}
            onOpenDetail={openDetail}
          />
        )}
        {safeScreen === "detail-hse"     && <DetailHSEScreen hseId={selectedHSEId} onBack={() => window.history.back()} />}
        {safeScreen === "detail-p1"      && <DetailP1Screen  p1Id={selectedP1Id}  onBack={() => window.history.back()} />}
        {safeScreen === "forgot-password" && <ForgotPasswordScreen navigate={setScreen} />}
        {safeScreen === "reset-password"  && <ResetPasswordScreen  navigate={setScreen} />}
      </div>

      {/* Dialog konfirmasi keluar */}
      {showExitConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: theme.surface, borderRadius: 16, padding: 24, width: "90%", maxWidth: 320, textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text, marginBottom: 8 }}>Keluar dari aplikasi?</div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>Kamu akan keluar dari VISION.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={cancelExit} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${theme.border}`, background: theme.surface, color: theme.text, fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={confirmExit} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: theme.danger, color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Dibungkus ThemeProvider di sini — satu-satunya perubahan dari App.jsx
// versi kamu yang sekarang. Semua logic di dalam (AppInner) sama persis,
// termasuk ExportScreen, AdminKendaraanScreen, dan sidebarScreens/hasSidebar.
const App = () => (
  <ThemeProvider>
    <AppInner />
  </ThemeProvider>
);

export default App;