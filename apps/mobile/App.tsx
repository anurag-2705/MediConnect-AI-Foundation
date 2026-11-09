import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";

type Locale = "en" | "hi";
type Role = "patient" | "community_health_worker" | "clinician" | "platform_admin";
type Area = { id: string; name: string; level: string; code: string };
type User = { id: string; displayName: string; phoneE164: string; role: Role; preferredLocale: string; homeServiceArea: Pick<Area, "id" | "name" | "level"> | null };
type Screen = "login" | "register" | "verify" | "workerInvite" | "home";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const REFRESH_KEY = "mediconnect.refresh-token.v1";

const strings = {
  en: {
    title: "MediConnect AI", subtitle: "Healthcare access, closer to home", language: "Language",
    login: "Sign in", register: "Create patient account", workerInvite: "Join as a health worker",
    name: "Full name", phone: "Phone with country code (e.g. +919876543210)", password: "Password (12+ characters)",
    village: "Choose your village", privacy: "I have read the development privacy notice (draft only).",
    create: "Create account", sendCode: "Send verification code", code: "6-digit verification code",
    verify: "Verify phone", back: "Back to sign in", noAccount: "New patient? Register", haveAccount: "Already registered? Sign in",
    inviteToken: "Invitation token from your administrator", acceptInvite: "Accept invitation",
    rolePatient: "Patient", roleWorker: "Community health worker", assignedAreas: "Your assigned service areas",
    accountReady: "Your account is active. Care features are not enabled in this foundation build.",
    notice: "Development build only. Do not enter real patient information. This app does not diagnose, prescribe, triage, or dispatch emergency services.",
    privacyRequired: "Please acknowledge the draft privacy notice to continue.",
    loading: "Please wait…", logout: "Sign out", noAreas: "No active service-area assignment was found.",
    noVillage: "No demo village found. Start the API and run the demo seed command.",
    apiHelp: "If this is a physical phone, set EXPO_PUBLIC_API_URL to your computer's LAN IP, not localhost."
  },
  hi: {
    title: "मेडीकनेक्ट AI", subtitle: "स्वास्थ्य सेवाएँ, आपके घर के करीब", language: "भाषा",
    login: "लॉग इन", register: "मरीज का खाता बनाएँ", workerInvite: "स्वास्थ्य कार्यकर्ता के रूप में जुड़ें",
    name: "पूरा नाम", phone: "देश कोड सहित फोन नंबर (जैसे +919876543210)", password: "पासवर्ड (कम से कम 12 अक्षर)",
    village: "अपना गाँव चुनें", privacy: "मैंने विकास संस्करण की गोपनीयता सूचना (मसौदा) पढ़ ली है।",
    create: "खाता बनाएँ", sendCode: "सत्यापन कोड भेजें", code: "6 अंकों का सत्यापन कोड",
    verify: "फोन सत्यापित करें", back: "लॉग इन पर वापस जाएँ", noAccount: "नए मरीज हैं? पंजीकरण करें", haveAccount: "पहले से खाता है? लॉग इन करें",
    inviteToken: "प्रशासक से मिला आमंत्रण टोकन", acceptInvite: "आमंत्रण स्वीकार करें",
    rolePatient: "मरीज", roleWorker: "सामुदायिक स्वास्थ्य कार्यकर्ता", assignedAreas: "आपके निर्धारित सेवा क्षेत्र",
    accountReady: "आपका खाता सक्रिय है। इस संस्करण में स्वास्थ्य सेवाएँ अभी चालू नहीं हैं।",
    notice: "केवल विकास संस्करण। मरीजों की असली जानकारी न डालें। यह ऐप बीमारी का निदान, दवा की सलाह, चिकित्सकीय छँटाई या आपातकालीन सेवा नहीं देता।",
    privacyRequired: "आगे बढ़ने के लिए मसौदा गोपनीयता सूचना स्वीकार करें।",
    loading: "कृपया प्रतीक्षा करें…", logout: "लॉग आउट", noAreas: "कोई सक्रिय सेवा क्षेत्र नहीं मिला।",
    noVillage: "डेमो गाँव नहीं मिला। API चालू करें और demo seed command चलाएँ।",
    apiHelp: "अगर आप असली फोन पर चला रहे हैं, तो EXPO_PUBLIC_API_URL में कंप्यूटर का Wi-Fi IP दें, localhost नहीं।"
  }
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) }
    });
  } catch {
    throw new Error(`Cannot reach the MediConnect API at ${API_BASE_URL}. ${strings.en.apiHelp}`);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status})`);
  return payload as T;
}

export default function App() {
  const [locale, setLocale] = useState<Locale>("hi");
  const t = strings[locale];
  const [screen, setScreen] = useState<Screen>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [workerAreas, setWorkerAreas] = useState<Area[]>([]);

  const selectedArea = useMemo(() => areas.find((a) => a.id === selectedAreaId), [areas, selectedAreaId]);

  useEffect(() => {
    let mounted = true;
    apiRequest<{ serviceAreas: Area[] }>("/v1/service-areas?level=village")
      .then((data) => { if (mounted) setAreas(data.serviceAreas); })
      .catch(() => { /* API help is shown in the screen footer. */ });

    (async () => {
      const savedRefresh = await SecureStore.getItemAsync(REFRESH_KEY);
      if (!savedRefresh || !mounted) return;
      try {
        const refreshed = await apiRequest<{ accessToken: string; refreshToken: string }>("/v1/auth/refresh", {
          method: "POST", body: JSON.stringify({ refreshToken: savedRefresh })
        });
        await SecureStore.setItemAsync(REFRESH_KEY, refreshed.refreshToken);
        const me = await apiRequest<User>("/v1/auth/me", { headers: { Authorization: `Bearer ${refreshed.accessToken}` } });
        if (mounted) {
          setAccessToken(refreshed.accessToken);
          setUser(me);
          setScreen("home");
          if (me.role === "community_health_worker") {
            const data = await apiRequest<{ areas: Area[] }>("/v1/auth/worker/assigned-areas", { headers: { Authorization: `Bearer ${refreshed.accessToken}` } });
            if (mounted) setWorkerAreas(data.areas);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(REFRESH_KEY);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function resetMessages() { setError(""); setNotice(""); }

  async function submitPatientRegistration() {
    resetMessages();
    if (!privacyAccepted) { setError(t.privacyRequired); return; }
    if (!selectedAreaId) { setError(t.noVillage); return; }
    setBusy(true);
    try {
      const result = await apiRequest<{ message: string }>("/v1/auth/register/patient", {
        method: "POST", body: JSON.stringify({
          displayName: name.trim(), phoneE164: phone.trim(), password, preferredLocale: locale,
          homeServiceAreaId: selectedAreaId, privacyNoticeAccepted: true
        })
      });
      setNotice(result.message);
      setScreen("verify");
    } catch (e) { setError(e instanceof Error ? e.message : "Registration failed"); }
    finally { setBusy(false); }
  }

  async function submitWorkerInvitation() {
    resetMessages(); setBusy(true);
    try {
      if (!privacyAccepted) { setError(t.privacyRequired); setBusy(false); return; }
      const result = await apiRequest<{ message: string; phoneE164: string }>("/v1/auth/accept-worker-invitation", {
        method: "POST", body: JSON.stringify({ invitationToken: invitationToken.trim(), displayName: name.trim(), password, preferredLocale: locale, privacyNoticeAccepted: true })
      });
      setPhone(result.phoneE164);
      setNotice(result.message);
      setScreen("verify");
    } catch (e) { setError(e instanceof Error ? e.message : "Invitation could not be accepted"); }
    finally { setBusy(false); }
  }

  async function verifyPhone() {
    resetMessages(); setBusy(true);
    try {
      const result = await apiRequest<{ message: string }>("/v1/auth/verify-phone", {
        method: "POST", body: JSON.stringify({ phoneE164: phone.trim(), code: otp.trim() })
      });
      setNotice(result.message);
      setScreen("login"); setPassword(""); setOtp("");
    } catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  async function login() {
    resetMessages(); setBusy(true);
    try {
      const tokens = await apiRequest<{ accessToken: string; refreshToken: string }>("/v1/auth/login", {
        method: "POST", body: JSON.stringify({ phoneE164: phone.trim(), password })
      });
      await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
      const me = await apiRequest<User>("/v1/auth/me", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
      setAccessToken(tokens.accessToken); setUser(me); setScreen("home");
      if (me.role === "community_health_worker") {
        const data = await apiRequest<{ areas: Area[] }>("/v1/auth/worker/assigned-areas", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        setWorkerAreas(data.areas);
      } else setWorkerAreas([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed"); }
    finally { setBusy(false); }
  }

  async function logout() {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
    if (refresh) {
      try { await apiRequest<void>("/v1/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: refresh }) }); }
      catch { /* Clear local credentials even if the network is unavailable. */ }
    }
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setAccessToken(""); setUser(null); setWorkerAreas([]); setPassword(""); setScreen("login"); resetMessages();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>{t.title}</Text>
            <Text style={styles.subtitle}>{t.subtitle}</Text>
          </View>

          <View style={styles.languageRow}>
            <Text style={styles.smallLabel}>{t.language}</Text>
            <Pressable onPress={() => setLocale("hi")} style={[styles.languageButton, locale === "hi" && styles.languageActive]}><Text style={[styles.languageText, locale === "hi" && styles.white]}>हिन्दी</Text></Pressable>
            <Pressable onPress={() => setLocale("en")} style={[styles.languageButton, locale === "en" && styles.languageActive]}><Text style={[styles.languageText, locale === "en" && styles.white]}>English</Text></Pressable>
          </View>

          {screen === "login" && <>
            <Text style={styles.heading}>{t.login}</Text>
            <Field label={t.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label={t.password} value={password} onChangeText={setPassword} secureTextEntry />
            <PrimaryButton label={t.login} onPress={login} disabled={busy} />
            <TextButton label={t.noAccount} onPress={() => { resetMessages(); setScreen("register"); }} />
            <TextButton label={t.workerInvite} onPress={() => { resetMessages(); setScreen("workerInvite"); }} />
          </>}

          {screen === "register" && <>
            <Text style={styles.heading}>{t.register}</Text>
            <Field label={t.name} value={name} onChangeText={setName} />
            <Field label={t.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label={t.password} value={password} onChangeText={setPassword} secureTextEntry />
            <Text style={styles.smallLabel}>{t.village}</Text>
            {areas.map((area) => (
              <Pressable key={area.id} onPress={() => setSelectedAreaId(area.id)} style={[styles.areaChoice, selectedAreaId === area.id && styles.areaSelected]}>
                <Text style={[styles.areaText, selectedAreaId === area.id && styles.white]}>{area.name}</Text>
              </Pressable>
            ))}
            {areas.length === 0 && <Text style={styles.muted}>{t.noVillage}</Text>}
            <Pressable onPress={() => setPrivacyAccepted((v) => !v)} style={styles.consentRow} accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted }}>
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}><Text style={styles.checkboxTick}>{privacyAccepted ? "✓" : ""}</Text></View>
              <Text style={styles.consentText}>{t.privacy}</Text>
            </Pressable>
            <PrimaryButton label={t.create} onPress={submitPatientRegistration} disabled={busy || areas.length === 0} />
            <TextButton label={t.haveAccount} onPress={() => { resetMessages(); setScreen("login"); }} />
          </>}

          {screen === "workerInvite" && <>
            <Text style={styles.heading}>{t.workerInvite}</Text>
            <Field label={t.inviteToken} value={invitationToken} onChangeText={setInvitationToken} autoCapitalize="none" />
            <Field label={t.name} value={name} onChangeText={setName} />
            <Field label={t.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label={t.password} value={password} onChangeText={setPassword} secureTextEntry />
            <Pressable onPress={() => setPrivacyAccepted((v) => !v)} style={styles.consentRow} accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted }}>
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}><Text style={styles.checkboxTick}>{privacyAccepted ? "✓" : ""}</Text></View>
              <Text style={styles.consentText}>{t.privacy}</Text>
            </Pressable>
            <PrimaryButton label={t.acceptInvite} onPress={submitWorkerInvitation} disabled={busy} />
            <TextButton label={t.back} onPress={() => { resetMessages(); setScreen("login"); }} />
          </>}

          {screen === "verify" && <>
            <Text style={styles.heading}>{t.verify}</Text>
            <Text style={styles.muted}>{phone}</Text>
            <Field label={t.code} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
            <PrimaryButton label={t.verify} onPress={verifyPhone} disabled={busy} />
            <TextButton label={t.back} onPress={() => { resetMessages(); setScreen("login"); }} />
          </>}

          {screen === "home" && user && <>
            <Text style={styles.heading}>{user.displayName}</Text>
            <Text style={styles.role}>{user.role === "patient" ? t.rolePatient : user.role === "community_health_worker" ? t.roleWorker : user.role === "platform_admin" ? "Platform administrator" : "Clinician"}</Text>
            <Text style={styles.body}>{t.accountReady}</Text>
            {user.role === "community_health_worker" && <>
              <Text style={styles.smallLabel}>{t.assignedAreas}</Text>
              {workerAreas.length ? workerAreas.map((area) => <View key={area.id} style={styles.areaInfo}><Text style={styles.areaInfoText}>{area.name} · {area.level}</Text></View>) : <Text style={styles.muted}>{t.noAreas}</Text>}
            </>}
            {user.homeServiceArea && <Text style={styles.muted}>{user.homeServiceArea.name}</Text>}
            <PrimaryButton label={t.logout} onPress={logout} disabled={busy} />
          </>}

          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text style={styles.success}>{notice}</Text>}
          {busy && <ActivityIndicator style={styles.spinner} color="#176b5d" />}
          <View style={styles.warning}><Text style={styles.warningText}>{t.notice}</Text></View>
          <Text style={styles.apiHelp}>{t.apiHelp}</Text>
          <Text style={styles.apiUrl}>API: {API_BASE_URL}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; secureTextEntry?: boolean; keyboardType?: "default" | "phone-pad" | "number-pad"; maxLength?: number; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  return <View style={styles.field}><Text style={styles.smallLabel}>{props.label}</Text><TextInput
    accessibilityLabel={props.label} value={props.value} onChangeText={props.onChangeText}
    secureTextEntry={props.secureTextEntry} keyboardType={props.keyboardType ?? "default"}
    maxLength={props.maxLength} autoCapitalize={props.autoCapitalize ?? "none"}
    autoCorrect={false} style={styles.input} placeholderTextColor="#82938f" /></View>;
}

function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={props.onPress} disabled={props.disabled} style={[styles.primary, props.disabled && styles.buttonDisabled]}><Text style={styles.primaryText}>{props.label}</Text></Pressable>;
}

function TextButton(props: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={props.onPress} style={styles.textButton}><Text style={styles.textButtonText}>{props.label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf9" }, flex: { flex: 1 }, container: { padding: 22, paddingBottom: 40 },
  header: { paddingTop: 22, paddingBottom: 16 }, brand: { fontSize: 28, fontWeight: "800", color: "#123c37" },
  subtitle: { fontSize: 16, color: "#526965", marginTop: 7 }, languageRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  smallLabel: { fontSize: 14, fontWeight: "700", color: "#35534d", marginBottom: 7 }, languageButton: { borderWidth: 1, borderColor: "#a9bcb7", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 13 },
  languageActive: { backgroundColor: "#176b5d", borderColor: "#176b5d" }, languageText: { color: "#24423d", fontWeight: "600" }, white: { color: "#fff" },
  heading: { fontSize: 21, fontWeight: "800", color: "#193c37", marginTop: 10, marginBottom: 16 }, field: { marginBottom: 13 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d0dfda", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 13, color: "#173c36", fontSize: 16 },
  primary: { backgroundColor: "#176b5d", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 8 }, primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  buttonDisabled: { opacity: 0.5 }, textButton: { paddingVertical: 13, alignItems: "center" }, textButtonText: { color: "#176b5d", fontWeight: "700", textAlign: "center" },
  areaChoice: { borderWidth: 1, borderColor: "#d0dfda", backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 7 }, areaSelected: { backgroundColor: "#176b5d", borderColor: "#176b5d" }, areaText: { color: "#193c37", fontWeight: "600" },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 13 }, checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#78918a", borderRadius: 5, alignItems: "center", justifyContent: "center" }, checkboxChecked: { backgroundColor: "#176b5d", borderColor: "#176b5d" }, checkboxTick: { color: "#fff", fontWeight: "800" }, consentText: { flex: 1, color: "#35534d", lineHeight: 20 },
  warning: { backgroundColor: "#fff4df", borderRadius: 11, padding: 13, marginTop: 22 }, warningText: { color: "#694b18", lineHeight: 20, fontSize: 13 },
  error: { color: "#a12626", backgroundColor: "#fdecec", borderRadius: 9, padding: 11, marginTop: 14 }, success: { color: "#176b5d", backgroundColor: "#e8f5ef", borderRadius: 9, padding: 11, marginTop: 14 },
  muted: { color: "#60736f", lineHeight: 21, marginBottom: 10 }, body: { color: "#526965", lineHeight: 22, marginBottom: 16 }, role: { color: "#176b5d", fontWeight: "700", marginBottom: 10 },
  areaInfo: { backgroundColor: "#fff", padding: 12, borderRadius: 9, marginBottom: 7 }, areaInfoText: { color: "#193c37" }, spinner: { marginTop: 12 }, apiHelp: { color: "#758681", fontSize: 12, lineHeight: 18, marginTop: 18 }, apiUrl: { color: "#8a9994", fontSize: 11, marginTop: 5 }
});
