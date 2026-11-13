import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import DateTimePicker from "@react-native-community/datetimepicker";

type Locale = "en" | "hi";

type Role =
  | "patient"
  | "community_health_worker"
  | "clinician"
  | "platform_admin";

type Area = {
  id: string;
  name: string;
  level: string;
  code: string;
};

type User = {
  id: string;
  displayName: string;
  phoneE164: string;
  role: Role;
  preferredLocale: string;
  homeServiceArea: Pick<Area, "id" | "name" | "level"> | null;
};

type Screen =
  | "login"
  | "register"
  | "verify"
  | "workerInvite"
  | "home"
  | "doctors"
  | "booking"
  | "appointments"
  | "doctorRequests";

type Doctor = {
  id: string;
  user_id: string;
  display_name: string;
  registration_council: string;
  registration_number: string;
  specialization: string | null;
  qualifications: string;
  years_of_experience: number;
  bio: string | null;
  languages: string[];
};

type Appointment = {
  id: string;
  doctor_profile_id: string;
  appointment_type: "in_person" | "video" | "home_visit";
  requested_start_at: string;
  reason: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "completed";
  doctor_note: string | null;
  doctor_name?: string;
  patient_name?: string;
  specialization?: string;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

const REFRESH_KEY = "mediconnect.refresh-token.v1";

const strings = {
  en: {
    title: "MediConnect AI",
    subtitle: "Healthcare access, closer to home",
    language: "Language",
    login: "Sign in",
    register: "Create patient account",
    workerInvite: "Join as a health worker",
    name: "Full name",
    phone: "Phone with country code (e.g. +919876543210)",
    password: "Password (12+ characters)",
    village: "Choose your village",
    privacy: "I have read the development privacy notice (draft only).",
    create: "Create account",
    sendCode: "Send verification code",
    code: "6-digit verification code",
    verify: "Verify phone",
    back: "Back to sign in",
    noAccount: "New patient? Register",
    haveAccount: "Already registered? Sign in",
    inviteToken: "Invitation token from your administrator",
    acceptInvite: "Accept invitation",
    rolePatient: "Patient",
    roleWorker: "Community health worker",
    assignedAreas: "Your assigned service areas",
    accountReady: "Your account is active.",
    notice:
      "Development build only. Do not enter real patient information. This app does not diagnose, prescribe, triage, or dispatch emergency services.",
    privacyRequired:
      "Please acknowledge the draft privacy notice to continue.",
    loading: "Please wait...",
    logout: "Sign out",
    noAreas: "No active service-area assignment was found.",
    noVillage:
      "No demo village found. Start the API and run the demo seed command.",
    apiHelp:
      "If this is a physical phone, set EXPO_PUBLIC_API_URL to your computer's LAN IP, not localhost.",

    doctors: "Find Doctors",
    appointments: "My Appointments",
    doctorRequests: "Appointment Requests",
    booking: "Book Appointment",
    noDoctors: "No verified doctors are currently available.",
    specialization: "Specialization",
    qualification: "Qualifications",
    experience: "Experience",
    languages: "Languages",
    bookNow: "Request Appointment",
    appointmentType: "Appointment Type",
    inPerson: "In Person",
    video: "Video Consultation",
    homeVisit: "Home Visit",
    appointmentDate: "Appointment Date and Time",
    appointmentDateHint: "2026-11-12T11:00:00+05:30",
    reason: "Reason for appointment",
    submitAppointment: "Submit Request",
    noAppointments: "No appointments found.",
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    cancelled: "Cancelled",
    completed: "Completed",
    cancelAppointment: "Cancel Request",
    accept: "Accept",
    reject: "Reject",
    patient: "Patient",
    doctor: "Doctor",
    doctorNote: "Doctor's Note",
    backHome: "Back to Dashboard",
    noRequests: "No appointment requests found.",
    selectedDoctor: "Selected Doctor"
  },

  hi: {
    title: "मेडीकनेक्ट AI",
    subtitle: "स्वास्थ्य सेवाएँ, आपके घर के करीब",
    language: "भाषा",
    login: "लॉग इन करें",
    register: "मरीज़ का खाता बनाएँ",
    workerInvite: "स्वास्थ्य कार्यकर्ता के रूप में जुड़ें",
    name: "पूरा नाम",
    phone: "देश कोड सहित फ़ोन नंबर (जैसे +919876543210)",
    password: "पासवर्ड (कम से कम 12 अक्षर)",
    village: "अपना गाँव चुनें",
    privacy: "मैंने विकास संबंधी गोपनीयता सूचना का मसौदा पढ़ लिया है।",
    create: "खाता बनाएँ",
    sendCode: "सत्यापन कोड भेजें",
    code: "6 अंकों का सत्यापन कोड",
    verify: "फ़ोन नंबर सत्यापित करें",
    back: "लॉग इन पर वापस जाएँ",
    noAccount: "नया मरीज़? पंजीकरण करें",
    haveAccount: "पहले से खाता है? लॉग इन करें",
    inviteToken: "प्रशासक से मिला आमंत्रण टोकन",
    acceptInvite: "आमंत्रण स्वीकार करें",
    rolePatient: "मरीज़",
    roleWorker: "सामुदायिक स्वास्थ्य कार्यकर्ता",
    assignedAreas: "आपके निर्धारित सेवा क्षेत्र",
    accountReady: "आपका खाता सक्रिय है।",
    notice: "यह केवल विकास संस्करण है। वास्तविक मरीज़ों की जानकारी दर्ज न करें। यह ऐप बीमारी का निदान, दवा लिखने, प्राथमिकता तय करने या आपातकालीन सेवाएँ भेजने का काम नहीं करता।",
    privacyRequired: "आगे बढ़ने के लिए कृपया गोपनीयता सूचना स्वीकार करें।",
    loading: "कृपया प्रतीक्षा करें...",
    logout: "लॉग आउट",
    noAreas: "कोई सक्रिय सेवा क्षेत्र नहीं मिला।",
    noVillage: "डेमो गाँव नहीं मिला। API शुरू करें और डेमो सीड कमांड चलाएँ।",
    apiHelp: "यदि आप इस ऐप को फ़ोन पर चला रहे हैं, तो EXPO_PUBLIC_API_URL में localhost की जगह अपने कंप्यूटर का LAN IP डालें।",
    doctors: "डॉक्टर खोजें",
    appointments: "मेरी अपॉइंटमेंट",
    doctorRequests: "अपॉइंटमेंट अनुरोध",
    booking: "अपॉइंटमेंट बुक करें",
    noDoctors: "अभी कोई सत्यापित डॉक्टर उपलब्ध नहीं है।",
    specialization: "विशेषज्ञता",
    qualification: "योग्यताएँ",
    experience: "अनुभव",
    languages: "भाषाएँ",
    bookNow: "अपॉइंटमेंट का अनुरोध करें",
    appointmentType: "अपॉइंटमेंट का प्रकार",
    inPerson: "व्यक्तिगत मुलाकात",
    video: "वीडियो परामर्श",
    homeVisit: "घर पर मुलाकात",
    appointmentDate: "अपॉइंटमेंट की तारीख और समय",
    appointmentDateHint: "2026-11-12T11:00:00+05:30",
    reason: "अपॉइंटमेंट का कारण",
    submitAppointment: "अनुरोध भेजें",
    noAppointments: "कोई अपॉइंटमेंट नहीं मिला।",
    pending: "लंबित",
    accepted: "स्वीकृत",
    rejected: "अस्वीकृत",
    cancelled: "रद्द",
    completed: "पूरा हुआ",
    cancelAppointment: "अनुरोध रद्द करें",
    accept: "स्वीकार करें",
    reject: "अस्वीकार करें",
    patient: "मरीज़",
    doctor: "डॉक्टर",
    doctorNote: "डॉक्टर की टिप्पणी",
    backHome: "डैशबोर्ड पर वापस जाएँ",
    noRequests: "कोई अपॉइंटमेंट अनुरोध नहीं मिला।",
    selectedDoctor: "चुने गए डॉक्टर"
  }
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });
  } catch {
    throw new Error(
      `Cannot reach the MediConnect API at ${API_BASE_URL}. ${strings.en.apiHelp}`
    );
  }

  const payload =
    response.status === 204
      ? null
      : await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error ??
        `Request failed (${response.status})`
    );
  }

  return payload as T;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function statusLabel(status: Appointment["status"]): string {
  const labels: Record<Appointment["status"], string> = {
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    cancelled: "Cancelled",
    completed: "Completed"
  };

  return labels[status] ?? status;
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

  // Doctor and appointment states

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorRequests, setDoctorRequests] = useState<Appointment[]>([]);

  // Appointment cancellation states
const [selectedCancellationId, setSelectedCancellationId] = useState("");
const [cancellationReason, setCancellationReason] = useState("");

  const [appointmentType, setAppointmentType] =
    useState<"in_person" | "video" | "home_visit">("in_person");

 const [selectedDate, setSelectedDate] = useState(new Date());
const [selectedTime, setSelectedTime] = useState("10:00");
const [showDatePicker, setShowDatePicker] = useState(false);
const [appointmentDate, setAppointmentDate] = useState("");
const [appointmentReason, setAppointmentReason] = useState("");

  const selectedArea = useMemo(
    () => areas.find((a) => a.id === selectedAreaId),
    [areas, selectedAreaId]
  );

  function authHeaders() {
    return {
      Authorization: `Bearer ${accessToken}`
    };
  }

  useEffect(() => {
    let mounted = true;

    apiRequest<{ serviceAreas: Area[] }>("/v1/service-areas?level=village")
  .then((data) => {
    if (mounted) {
      const villages = data.serviceAreas ?? [];

      setAreas(villages);

      if (villages.length > 0) {
        setSelectedAreaId(villages[0].id);
      }
    }
  })
      .catch(() => {
        // API help is shown in the screen footer.
      });

    (async () => {
      const savedRefresh = await SecureStore.getItemAsync(REFRESH_KEY);

      if (!savedRefresh || !mounted) {
        return;
      }

      try {
        const refreshed = await apiRequest<{
          accessToken: string;
          refreshToken: string;
        }>("/v1/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken: savedRefresh })
        });

        await SecureStore.setItemAsync(
          REFRESH_KEY,
          refreshed.refreshToken
        );

        const me = await apiRequest<User>("/v1/auth/me", {
          headers: {
            Authorization: `Bearer ${refreshed.accessToken}`
          }
        });

        if (mounted) {
          setAccessToken(refreshed.accessToken);
          setUser(me);
          setScreen("home");

          if (me.role === "community_health_worker") {
            const data = await apiRequest<{ areas: Area[] }>(
              "/v1/auth/worker/assigned-areas",
              {
                headers: {
                  Authorization: `Bearer ${refreshed.accessToken}`
                }
              }
            );

            if (mounted) {
              setWorkerAreas(data.areas);
            }
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(REFRESH_KEY);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function resetMessages() {
    setError("");
    setNotice("");
  }

  async function submitPatientRegistration() {
    resetMessages();

    if (!privacyAccepted) {
      setError(t.privacyRequired);
      return;
    }

    if (!selectedAreaId) {
      setError(t.noVillage);
      return;
    }

    setBusy(true);

    try {
      const result = await apiRequest<{ message: string }>(
        "/v1/auth/register/patient",
        {
          method: "POST",
          body: JSON.stringify({
            displayName: name.trim(),
            phoneE164: phone.trim(),
            password,
            preferredLocale: locale,
            homeServiceAreaId: selectedAreaId,
            privacyNoticeAccepted: true
          })
        }
      );

      setNotice(result.message);
      setScreen("verify");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Registration failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitWorkerInvitation() {
    resetMessages();
    setBusy(true);

    try {
      if (!privacyAccepted) {
        setError(t.privacyRequired);
        setBusy(false);
        return;
      }

      const result = await apiRequest<{
        message: string;
        phoneE164: string;
      }>("/v1/auth/accept-worker-invitation", {
        method: "POST",
        body: JSON.stringify({
          invitationToken: invitationToken.trim(),
          displayName: name.trim(),
          password,
          preferredLocale: locale,
          privacyNoticeAccepted: true
        })
      });

      setPhone(result.phoneE164);
      setNotice(result.message);
      setScreen("verify");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Invitation could not be accepted"
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone() {
    resetMessages();
    setBusy(true);

    try {
      const result = await apiRequest<{ message: string }>(
        "/v1/auth/verify-phone",
        {
          method: "POST",
          body: JSON.stringify({
            phoneE164: phone.trim(),
            code: otp.trim()
          })
        }
      );

      setNotice(result.message);
      setScreen("login");
      setPassword("");
      setOtp("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Verification failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    resetMessages();
    setBusy(true);

    try {
      const tokens = await apiRequest<{
        accessToken: string;
        refreshToken: string;
      }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          phoneE164: phone.trim(),
          password
        })
      });

      await SecureStore.setItemAsync(
        REFRESH_KEY,
        tokens.refreshToken
      );

      const me = await apiRequest<User>("/v1/auth/me", {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`
        }
      });

      setAccessToken(tokens.accessToken);
      setUser(me);
      setScreen("home");

      if (me.role === "community_health_worker") {
        const data = await apiRequest<{ areas: Area[] }>(
          "/v1/auth/worker/assigned-areas",
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`
            }
          }
        );

        setWorkerAreas(data.areas);
      } else {
        setWorkerAreas([]);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign in failed"
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY);

    if (refresh) {
      try {
        await apiRequest<void>("/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: refresh })
        });
      } catch {
        // Clear local credentials even if the network is unavailable.
      }
    }

    await SecureStore.deleteItemAsync(REFRESH_KEY);

    setAccessToken("");
    setUser(null);
    setWorkerAreas([]);
    setDoctors([]);
    setAppointments([]);
    setDoctorRequests([]);
    setSelectedDoctor(null);
    setPassword("");
    setScreen("login");

    resetMessages();
  }

  // =========================================
  // DOCTOR DIRECTORY
  // =========================================

  async function loadDoctors() {
    resetMessages();
    setBusy(true);

    try {
      const data = await apiRequest<{
        count: number;
        doctors: Doctor[];
      }>("/v1/doctors/directory", {
        headers: authHeaders()
      });

      setDoctors(data.doctors);
      setScreen("doctors");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load doctors"
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================
  // APPOINTMENT BOOKING
  // =========================================

 function openBooking(doctor: Doctor) {
  setSelectedDoctor(doctor);
  setAppointmentType("in_person");

  // Reset appointment date and time
  setSelectedDate(new Date());
  setSelectedTime("10:00");
  setShowDatePicker(false);
  setAppointmentDate("");

  setAppointmentReason("");
  resetMessages();
  setScreen("booking");
}

 async function createAppointment() {
  resetMessages();

  if (!selectedDoctor) {
    setError("Please select a doctor.");
    return;
  }

  if (!appointmentReason.trim()) {
    setError("Please enter the reason for the appointment.");
    return;
  }

  // Convert selected date and time into a local Date object
  const [hours, minutes] = selectedTime.split(":").map(Number);

  const appointmentDateTime = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    hours,
    minutes,
    0
  );

  if (Number.isNaN(appointmentDateTime.getTime())) {
    setError("Invalid appointment date or time.");
    return;
  }

  if (appointmentDateTime.getTime() <= Date.now()) {
    setError("Please select a future appointment time.");
    return;
  }

  // Convert to ISO format for the backend
  const requestedStartAt = appointmentDateTime.toISOString();

  setBusy(true);

  try {
    const result = await apiRequest<{
      message: string;
      appointment: Appointment;
    }>("/v1/appointments", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        doctorProfileId: selectedDoctor.id,
        appointmentType,
        requestedStartAt,
        reason: appointmentReason.trim()
      })
    });

    setNotice(result.message);
    await loadPatientAppointments();
    setScreen("appointments");
  } catch (e) {
    setError(
      e instanceof Error
        ? e.message
        : "Unable to submit appointment"
    );
  } finally {
    setBusy(false);
  }
}
  // =========================================
  // PATIENT APPOINTMENTS
  // =========================================

  async function loadPatientAppointments() {
    try {
      const data = await apiRequest<{
        count: number;
        appointments: Appointment[];
      }>("/v1/appointments/me", {
        headers: authHeaders()
      });

      setAppointments(data.appointments);
    } catch (e) {
      throw e;
    }
  }

  async function openPatientAppointments() {
    resetMessages();
    setBusy(true);

    try {
      await loadPatientAppointments();
      setScreen("appointments");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load appointments"
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(appointmentId: string) {
  const reason = cancellationReason.trim();

  if (reason.length < 3 || reason.length > 1000) {
    setError("Please enter a cancellation reason (3â€“1000 characters).");
    return;
  }

  resetMessages();
  setBusy(true);

  try {
    const result = await apiRequest<{
      message: string;
    }>(`/v1/appointments/${appointmentId}/cancel`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ reason })
    });

    setNotice(result.message);
    setSelectedCancellationId("");
    setCancellationReason("");

    if (user?.role === "clinician") {
      await loadDoctorRequests();
    } else {
      await loadPatientAppointments();
    }
  } catch (e) {
    setError(
      e instanceof Error
        ? e.message
        : "Unable to cancel appointment"
    );
  } finally {
    setBusy(false);
  }
}

  // =========================================
  // CLINICIAN APPOINTMENT REQUESTS
  // =========================================

  async function loadDoctorRequests() {
    try {
      const data = await apiRequest<{
        count: number;
        appointments: Appointment[];
      }>("/v1/appointments/doctor", {
        headers: authHeaders()
      });

      setDoctorRequests(data.appointments);
    } catch (e) {
      throw e;
    }
  }

  async function openDoctorRequests() {
    resetMessages();
    setBusy(true);

    try {
      await loadDoctorRequests();
      setScreen("doctorRequests");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load doctor requests"
      );
    } finally {
      setBusy(false);
    }
  }

  async function decideAppointment(
    appointmentId: string,
    status: "accepted" | "rejected"
  ) {
    resetMessages();
    setBusy(true);

    try {
      const result = await apiRequest<{
        message: string;
      }>(`/v1/appointments/${appointmentId}/decision`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          status,
          doctorNote: "Updated through MediConnect AI mobile app."
        })
      });

      setNotice(result.message);
      await loadDoctorRequests();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to update appointment"
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================
  // MAIN USER INTERFACE
  // =========================================

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* HEADER */}

          <View style={styles.header}>
            <Text style={styles.brand}>{t.title}</Text>
            <Text style={styles.subtitle}>{t.subtitle}</Text>
          </View>

          {/* LANGUAGE */}

          <View style={styles.languageRow}>
            <Text style={styles.smallLabel}>{t.language}</Text>

            <Pressable
              onPress={() => setLocale("hi")}
              style={[
                styles.languageButton,
                locale === "hi" && styles.languageActive
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  locale === "hi" && styles.white
                ]}
              >
                हिन्दी
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setLocale("en")}
              style={[
                styles.languageButton,
                locale === "en" && styles.languageActive
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  locale === "en" && styles.white
                ]}
              >
                English
              </Text>
            </Pressable>
          </View>

          {/* LOGIN */}

          {screen === "login" && (
            <>
              <Text style={styles.heading}>{t.login}</Text>

              <Field
                label={t.phone}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Field
                label={t.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <PrimaryButton
                label={t.login}
                onPress={login}
                disabled={busy}
              />

              <TextButton
                label={t.noAccount}
                onPress={() => {
                  resetMessages();
                  setScreen("register");
                }}
              />

              <TextButton
                label={t.workerInvite}
                onPress={() => {
                  resetMessages();
                  setScreen("workerInvite");
                }}
              />
            </>
          )}

          {/* PATIENT REGISTRATION */}

          {screen === "register" && (
            <>
              <Text style={styles.heading}>{t.register}</Text>

              <Field
                label={t.name}
                value={name}
                onChangeText={setName}
              />

              <Field
                label={t.phone}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Field
                label={t.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Text style={styles.smallLabel}>{t.village}</Text>

              {areas.map((area) => (
                <Pressable
                  key={area.id}
                  onPress={() => setSelectedAreaId(area.id)}
                  style={[
                    styles.areaChoice,
                    selectedAreaId === area.id &&
                      styles.areaSelected
                  ]}
                >
                  <Text
                    style={[
                      styles.areaText,
                      selectedAreaId === area.id && styles.white
                    ]}
                  >
                    {area.name}
                  </Text>
                </Pressable>
              ))}

              {areas.length === 0 && (
                <Text style={styles.muted}>{t.noVillage}</Text>
              )}

              <Pressable
                onPress={() =>
                  setPrivacyAccepted((v) => !v)
                }
                style={styles.consentRow}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: privacyAccepted
                }}
              >
                <View
                  style={[
                    styles.checkbox,
                    privacyAccepted && styles.checkboxChecked
                  ]}
                >
                  <Text style={styles.checkboxTick}>
                    {privacyAccepted ? "âœ“" : ""}
                  </Text>
                </View>

                <Text style={styles.consentText}>
                  {t.privacy}
                </Text>
              </Pressable>

              <PrimaryButton
                label={t.create}
                onPress={submitPatientRegistration}
                disabled={busy || areas.length === 0}
              />

              <TextButton
                label={t.haveAccount}
                onPress={() => {
                  resetMessages();
                  setScreen("login");
                }}
              />
            </>
          )}

          {/* HEALTH WORKER INVITATION */}

          {screen === "workerInvite" && (
            <>
              <Text style={styles.heading}>
                {t.workerInvite}
              </Text>

              <Field
                label={t.inviteToken}
                value={invitationToken}
                onChangeText={setInvitationToken}
                autoCapitalize="none"
              />

              <Field
                label={t.name}
                value={name}
                onChangeText={setName}
              />

              <Field
                label={t.phone}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />

              <Field
                label={t.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Pressable
                onPress={() =>
                  setPrivacyAccepted((v) => !v)
                }
                style={styles.consentRow}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: privacyAccepted
                }}
              >
                <View
                  style={[
                    styles.checkbox,
                    privacyAccepted && styles.checkboxChecked
                  ]}
                >
                  <Text style={styles.checkboxTick}>
                    {privacyAccepted ? "âœ“" : ""}
                  </Text>
                </View>

                <Text style={styles.consentText}>
                  {t.privacy}
                </Text>
              </Pressable>

              <PrimaryButton
                label={t.acceptInvite}
                onPress={submitWorkerInvitation}
                disabled={busy}
              />

              <TextButton
                label={t.back}
                onPress={() => {
                  resetMessages();
                  setScreen("login");
                }}
              />
            </>
          )}

          {/* PHONE VERIFICATION */}

          {screen === "verify" && (
            <>
              <Text style={styles.heading}>{t.verify}</Text>

              <Text style={styles.muted}>{phone}</Text>

              <Field
                label={t.code}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />

              <PrimaryButton
                label={t.verify}
                onPress={verifyPhone}
                disabled={busy}
              />

              <TextButton
                label={t.back}
                onPress={() => {
                  resetMessages();
                  setScreen("login");
                }}
              />
            </>
          )}

          {/* HOME DASHBOARD */}

          {screen === "home" && user && (
            <>
              <Text style={styles.heading}>
                {user.displayName}
              </Text>

              <Text style={styles.role}>
                {user.role === "patient"
                  ? t.rolePatient
                  : user.role === "community_health_worker"
                    ? t.roleWorker
                    : user.role === "platform_admin"
                      ? "Platform administrator"
                      : "Clinician"}
              </Text>

              <Text style={styles.body}>
                {t.accountReady}
              </Text>

              {user.role === "patient" && (
                <>
                  <PrimaryButton
                    label={t.doctors}
                    onPress={loadDoctors}
                    disabled={busy}
                  />

                  <PrimaryButton
                    label={t.appointments}
                    onPress={openPatientAppointments}
                    disabled={busy}
                  />
                </>
              )}

              {user.role === "clinician" && (
                <PrimaryButton
                  label={t.doctorRequests}
                  onPress={openDoctorRequests}
                  disabled={busy}
                />
              )}

              {user.role === "community_health_worker" && (
                <>
                  <Text style={styles.smallLabel}>
                    {t.assignedAreas}
                  </Text>

                  {workerAreas.length ? (
                    workerAreas.map((area) => (
                      <View
                        key={area.id}
                        style={styles.areaInfo}
                      >
                        <Text style={styles.areaInfoText}>
                          {area.name} Â· {area.level}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.muted}>
                      {t.noAreas}
                    </Text>
                  )}
                </>
              )}

              {user.homeServiceArea && (
                <Text style={styles.muted}>
                  {user.homeServiceArea.name}
                </Text>
              )}

              <PrimaryButton
                label={t.logout}
                onPress={logout}
                disabled={busy}
              />
            </>
          )}

          {/* DOCTOR DIRECTORY */}

          {screen === "doctors" && (
            <>
              <Text style={styles.heading}>
                {t.doctors}
              </Text>

              {doctors.length === 0 && (
                <Text style={styles.muted}>
                  {t.noDoctors}
                </Text>
              )}

              {doctors.map((doctor) => (
                <View
                  key={doctor.id}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>
                    Dr. {doctor.display_name}
                  </Text>

                  <Text style={styles.cardText}>
                    {t.specialization}:{" "}
                    {doctor.specialization || "General"}
                  </Text>

                  <Text style={styles.cardText}>
                    {t.qualification}: {doctor.qualifications}
                  </Text>

                  <Text style={styles.cardText}>
                    {t.experience}:{" "}
                    {doctor.years_of_experience} years
                  </Text>

                  <Text style={styles.cardText}>
                    {t.languages}:{" "}
                    {doctor.languages?.join(", ") || "Not specified"}
                  </Text>

                  {doctor.bio ? (
                    <Text style={styles.cardText}>
                      {doctor.bio}
                    </Text>
                  ) : null}

                  <PrimaryButton
                    label={t.bookNow}
                    onPress={() => openBooking(doctor)}
                    disabled={busy}
                  />
                </View>
              ))}

              <TextButton
                label={t.backHome}
                onPress={() => setScreen("home")}
              />
            </>
          )}

          {/* APPOINTMENT BOOKING */}

          {screen === "booking" && selectedDoctor && (
            <>
              <Text style={styles.heading}>
                {t.booking}
              </Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  Dr. {selectedDoctor.display_name}
                </Text>

                <Text style={styles.cardText}>
                  {selectedDoctor.specialization || "General"}
                </Text>
              </View>

              <Text style={styles.smallLabel}>
                {t.appointmentType}
              </Text>

              {(
                [
                  ["in_person", t.inPerson],
                  ["video", t.video],
                  ["home_visit", t.homeVisit]
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setAppointmentType(value)}
                  style={[
                    styles.areaChoice,
                    appointmentType === value &&
                      styles.areaSelected
                  ]}
                >
                  <Text
                    style={[
                      styles.areaText,
                      appointmentType === value && styles.white
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}

              <Text style={styles.smallLabel}>Select Appointment Date</Text>

<Pressable
  style={styles.areaChoice}
  onPress={() => setShowDatePicker(true)}
>
  <Text style={styles.areaText}>
    ðŸ“… {selectedDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric"
    })}
  </Text>
</Pressable>

{showDatePicker && (
  <DateTimePicker
    value={selectedDate}
    mode="date"
    display="default"
    minimumDate={new Date()}
    onChange={(_event, date) => {
      setShowDatePicker(false);
      if (date) {
        setSelectedDate(date);
      }
    }}
  />
)}

<Text style={styles.smallLabel}>Select Appointment Time</Text>

{(
  [
    ["10:00", "10:00 AM"],
    ["10:30", "10:30 AM"],
    ["11:00", "11:00 AM"],
    ["11:30", "11:30 AM"],
    ["12:00", "12:00 PM"],
    ["12:30", "12:30 PM"],
    ["13:00", "1:00 PM"],
    ["14:00", "2:00 PM"],
    ["14:30", "2:30 PM"],
    ["15:00", "3:00 PM"],
    ["15:30", "3:30 PM"],
    ["16:00", "4:00 PM"],
    ["16:30", "4:30 PM"],
    ["17:00", "5:00 PM"]
  ] as const
).map(([value, label]) => (
  <Pressable
    key={value}
    onPress={() => setSelectedTime(value)}
    style={[
      styles.areaChoice,
      selectedTime === value && styles.areaSelected
    ]}
  >
    <Text
      style={[
        styles.areaText,
        selectedTime === value && styles.white
      ]}
    >
      {label}
    </Text>
  </Pressable>
))}

              <Text style={styles.muted}>
                Use an ISO date and time with timezone offset,
                for example: 2026-11-12T11:00:00+05:30
              </Text>

              <Field
                label={t.reason}
                value={appointmentReason}
                onChangeText={setAppointmentReason}
                multiline
              />

              <PrimaryButton
                label={t.submitAppointment}
                onPress={createAppointment}
                disabled={busy}
              />

              <TextButton
                label={t.back}
                onPress={() => setScreen("doctors")}
              />
            </>
          )}

          {/* PATIENT APPOINTMENT HISTORY */}

          {screen === "appointments" && (
            <>
              <Text style={styles.heading}>
                {t.appointments}
              </Text>

              {appointments.length === 0 && (
                <Text style={styles.muted}>
                  {t.noAppointments}
                </Text>
              )}

              {appointments.map((appointment) => (
                <View
                  key={appointment.id}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>
                    Dr. {appointment.doctor_name || "Doctor"}
                  </Text>

                  <Text style={styles.cardText}>
                    {appointment.specialization || "General"}
                  </Text>

                  <Text style={styles.cardText}>
                    Date:{" "}
                    {formatDate(appointment.requested_start_at)}
                  </Text>

                  <Text style={styles.cardText}>
                    Type: {appointment.appointment_type}
                  </Text>

                  <Text style={styles.cardText}>
                    Status: {statusLabel(appointment.status)}
                  </Text>

                  <Text style={styles.cardText}>
                    Reason: {appointment.reason}
                  </Text>

                  {appointment.doctor_note ? (
                    <Text style={styles.cardText}>
                      {t.doctorNote}: {appointment.doctor_note}
                    </Text>
                  ) : null}

                 {["pending", "accepted"].includes(appointment.status) &&
  new Date(appointment.requested_start_at).getTime() > Date.now() && (
    <>
      {selectedCancellationId !== appointment.id ? (
        <PrimaryButton
          label={t.cancelAppointment}
          onPress={() => {
            setSelectedCancellationId(appointment.id);
            setCancellationReason("");
            resetMessages();
          }}
          disabled={busy}
        />
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Cancellation reason
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your reason (minimum 3 characters)"
            value={cancellationReason}
            onChangeText={setCancellationReason}
            multiline
            maxLength={1000}
          />

          <PrimaryButton
            label="Confirm Cancellation"
            onPress={() => cancelAppointment(appointment.id)}
            disabled={busy || cancellationReason.trim().length < 3}
          />

          <TextButton
            label="Go Back"
            onPress={() => {
              setSelectedCancellationId("");
              setCancellationReason("");
            }}
          />
        </View>
      )}
    </>
  )}
                </View>
              ))}

              <TextButton
                label={t.backHome}
                onPress={() => setScreen("home")}
              />
            </>
          )}

          {/* CLINICIAN APPOINTMENT REQUESTS */}

          {screen === "doctorRequests" && (
            <>
              <Text style={styles.heading}>
                {t.doctorRequests}
              </Text>

              {doctorRequests.length === 0 && (
                <Text style={styles.muted}>
                  {t.noRequests}
                </Text>
              )}

              {doctorRequests.map((appointment) => (
                <View
                  key={appointment.id}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>
                    {t.patient}:{" "}
                    {appointment.patient_name || "Patient"}
                  </Text>

                  <Text style={styles.cardText}>
                    Date:{" "}
                    {formatDate(appointment.requested_start_at)}
                  </Text>

                  <Text style={styles.cardText}>
                    Type: {appointment.appointment_type}
                  </Text>

                  <Text style={styles.cardText}>
                    Reason: {appointment.reason}
                  </Text>

                  <Text style={styles.cardText}>
                    Status: {statusLabel(appointment.status)}
                  </Text>

                  {appointment.status === "pending" && (
                    <View style={styles.decisionRow}>
                      <View style={styles.decisionButton}>
                        <PrimaryButton
                          label={t.accept}
                          onPress={() =>
                            decideAppointment(
                              appointment.id,
                              "accepted"
                            )
                          }
                          disabled={busy}
                        />
                      </View>
                      <View style={styles.decisionButton}>
                        <Pressable
                          onPress={() =>
                            decideAppointment(
                              appointment.id,
                              "rejected"
                            )
                          }
                          disabled={busy}
                          style={[
                            styles.rejectButton,
                            busy && styles.buttonDisabled
                          ]}
                        >
                          <Text style={styles.rejectText}>
                            {t.reject}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {appointment.status === "accepted" &&
                    new Date(appointment.requested_start_at).getTime() > Date.now() && (
                      <>
                        {selectedCancellationId !== appointment.id ? (
                          <PrimaryButton
                            label={t.cancelAppointment}
                            onPress={() => {
                              setSelectedCancellationId(appointment.id);
                              setCancellationReason("");
                              resetMessages();
                            }}
                            disabled={busy}
                          />
                        ) : (
                          <View style={styles.card}>
                            <Text style={styles.cardTitle}>
                              Cancellation reason
                            </Text>
                            <TextInput
                              style={styles.input}
                              placeholder="Enter your reason (minimum 3 characters)"
                              value={cancellationReason}
                              onChangeText={setCancellationReason}
                              multiline
                              maxLength={1000}
                            />
                            <PrimaryButton
                              label="Confirm Cancellation"
                              onPress={() => cancelAppointment(appointment.id)}
                              disabled={busy || cancellationReason.trim().length < 3}
                            />
                            <TextButton
                              label="Go Back"
                              onPress={() => {
                                setSelectedCancellationId("");
                                setCancellationReason("");
                              }}
                            />
                          </View>
                        )}
                      </>
                    )}
                </View>
              ))}

              <TextButton
                label={t.backHome}
                onPress={() => setScreen("home")}
              />
            </>
          )}

          {/* ERRORS AND NOTICES */}

          {!!error && (
            <Text
              accessibilityRole="alert"
              style={styles.error}
            >
              {error}
            </Text>
          )}

          {!!notice && (
            <Text style={styles.success}>
              {notice}
            </Text>
          )}

          {busy && (
            <ActivityIndicator
              style={styles.spinner}
              color="#176b5d"
            />
          )}

          <View style={styles.warning}>
            <Text style={styles.warningText}>
              {t.notice}
            </Text>
          </View>

          <Text style={styles.apiHelp}>
            {t.apiHelp}
          </Text>

          <Text style={styles.apiUrl}>
            API: {API_BASE_URL}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =========================================
// REUSABLE INPUT COMPONENT
// =========================================

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad" | "number-pad";
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.smallLabel}>
        {props.label}
      </Text>

      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType ?? "default"}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize ?? "none"}
        autoCorrect={false}
        multiline={props.multiline}
        placeholder={props.placeholder}
        placeholderTextColor="#82938f"
        style={[
          styles.input,
          props.multiline && styles.multilineInput
        ]}
      />
    </View>
  );
}

// =========================================
// PRIMARY BUTTON
// =========================================

function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.primary,
        props.disabled && styles.buttonDisabled
      ]}
    >
      <Text style={styles.primaryText}>
        {props.label}
      </Text>
    </Pressable>
  );
}

// =========================================
// TEXT BUTTON
// =========================================

function TextButton(props: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={styles.textButton}
    >
      <Text style={styles.textButtonText}>
        {props.label}
      </Text>
    </Pressable>
  );
}

// =========================================
// APPLICATION STYLES
// =========================================

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f7faf9"
  },

  flex: {
    flex: 1
  },

  container: {
    padding: 22,
    paddingBottom: 40
  },

  header: {
    paddingTop: 22,
    paddingBottom: 16
  },

  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#123c37"
  },

  subtitle: {
    fontSize: 16,
    color: "#526965",
    marginTop: 7
  },

  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18
  },

  smallLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#35534d",
    marginBottom: 7
  },

  languageButton: {
    borderWidth: 1,
    borderColor: "#a9bcb7",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 13
  },

  languageActive: {
    backgroundColor: "#176b5d",
    borderColor: "#176b5d"
  },

  languageText: {
    color: "#24423d",
    fontWeight: "600"
  },

  white: {
    color: "#fff"
  },

  heading: {
    fontSize: 21,
    fontWeight: "800",
    color: "#193c37",
    marginTop: 10,
    marginBottom: 16
  },

  field: {
    marginBottom: 13
  },

  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0dfda",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    color: "#173c36",
    fontSize: 16
  },

  multilineInput: {
    minHeight: 100,
    textAlignVertical: "top"
  },

  primary: {
    backgroundColor: "#176b5d",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8
  },

  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },

  buttonDisabled: {
    opacity: 0.5
  },

  textButton: {
    paddingVertical: 13,
    alignItems: "center"
  },

  textButtonText: {
    color: "#176b5d",
    fontWeight: "700",
    textAlign: "center"
  },

  areaChoice: {
    borderWidth: 1,
    borderColor: "#d0dfda",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 7
  },

  areaSelected: {
    backgroundColor: "#176b5d",
    borderColor: "#176b5d"
  },

  areaText: {
    color: "#193c37",
    fontWeight: "600"
  },

  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 13
  },

  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: "#78918a",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center"
  },

  checkboxChecked: {
    backgroundColor: "#176b5d",
    borderColor: "#176b5d"
  },

  checkboxTick: {
    color: "#fff",
    fontWeight: "800"
  },

  consentText: {
    flex: 1,
    color: "#35534d",
    lineHeight: 20
  },

  warning: {
    backgroundColor: "#fff4df",
    borderRadius: 11,
    padding: 13,
    marginTop: 22
  },

  warningText: {
    color: "#694b18",
    lineHeight: 20,
    fontSize: 13
  },

  error: {
    color: "#a12626",
    backgroundColor: "#fdecec",
    borderRadius: 9,
    padding: 11,
    marginTop: 14
  },

  success: {
    color: "#176b5d",
    backgroundColor: "#e8f5ef",
    borderRadius: 9,
    padding: 11,
    marginTop: 14
  },

  muted: {
    color: "#60736f",
    lineHeight: 21,
    marginBottom: 10
  },

  body: {
    color: "#526965",
    lineHeight: 22,
    marginBottom: 16
  },

  role: {
    color: "#176b5d",
    fontWeight: "700",
    marginBottom: 10
  },

  areaInfo: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 9,
    marginBottom: 7
  },

  areaInfoText: {
    color: "#193c37"
  },

  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dce8e3",
    borderRadius: 13,
    padding: 15,
    marginBottom: 14
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#193c37",
    marginBottom: 9
  },

  cardText: {
    color: "#526965",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 5
  },

  decisionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5
  },

  decisionButton: {
    flex: 1
  },

  rejectButton: {
    backgroundColor: "#a12626",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8
  },

  rejectText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700"
  },

  spinner: {
    marginTop: 12
  },

  apiHelp: {
    color: "#758681",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18
  },

  apiUrl: {
    color: "#8a9994",
    fontSize: 11,
    marginTop: 5
  }
});
