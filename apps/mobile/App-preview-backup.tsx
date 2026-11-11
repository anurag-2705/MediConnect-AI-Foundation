import React, { useState } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";

type Locale = "en" | "hi";
const copy = {
  en: {
    title: "MediConnect AI",
    subtitle: "Healthcare access, closer to home",
    choose: "Choose your language",
    patient: "I am a patient",
    worker: "I am a community health worker",
    appointments: "Appointments",
    facilities: "Find a health facility",
    notice: "This app is a development preview. It does not provide medical diagnosis or emergency dispatch.",
    next: "The next release will add secure sign-in and approved care workflows."
  },
  hi: {
    title: "मेडीकनेक्ट AI",
    subtitle: "स्वास्थ्य सेवाएँ, आपके घर के करीब",
    choose: "अपनी भाषा चुनें",
    patient: "मैं मरीज हूँ",
    worker: "मैं सामुदायिक स्वास्थ्य कार्यकर्ता हूँ",
    appointments: "अपॉइंटमेंट",
    facilities: "स्वास्थ्य केंद्र खोजें",
    notice: "यह ऐप अभी विकास के चरण में है। यह बीमारी का निदान या आपातकालीन सेवा उपलब्ध नहीं कराता।",
    next: "अगले संस्करण में सुरक्षित लॉगिन और स्वीकृत स्वास्थ्य सेवाएँ जोड़ी जाएँगी।"
  }
};

export default function App() {
  const [locale, setLocale] = useState<Locale>("hi");
  const t = copy[locale];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>
        </View>

        <Text style={styles.section}>{t.choose}</Text>
        <View style={styles.row}>
          <LanguageButton label="हिन्दी" active={locale === "hi"} onPress={() => setLocale("hi")} />
          <LanguageButton label="English" active={locale === "en"} onPress={() => setLocale("en")} />
        </View>

        <Text style={styles.section}> {locale === "hi" ? "आप कैसे आगे बढ़ना चाहते हैं?" : "How would you like to continue?"}</Text>
        <ActionCard label={t.patient} />
        <ActionCard label={t.worker} />

        <Text style={styles.section}>{locale === "hi" ? "सेवाएँ" : "Services"}</Text>
        <ActionCard label={t.appointments} disabled />
        <ActionCard label={t.facilities} disabled />

        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t.notice}</Text>
        </View>
        <Text style={styles.footer}>{t.next}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function LanguageButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: props.active }}
      onPress={props.onPress} style={[styles.language, props.active && styles.active]}>
      <Text style={[styles.languageText, props.active && styles.activeText]}>{props.label}</Text>
    </Pressable>
  );
}

function ActionCard(props: { label: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled} style={[styles.card, props.disabled && styles.disabled]}>
      <Text style={styles.cardText}>{props.label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7faf9" },
  container: { padding: 22, paddingBottom: 44 },
  header: { paddingTop: 28, paddingBottom: 22 },
  brand: { fontSize: 28, fontWeight: "800", color: "#123c37" },
  subtitle: { fontSize: 16, color: "#526965", marginTop: 8 },
  section: { fontSize: 17, fontWeight: "700", color: "#193c37", marginTop: 24, marginBottom: 12 },
  row: { flexDirection: "row", gap: 10 },
  language: { flex: 1, borderWidth: 1, borderColor: "#a9bcb7", borderRadius: 12, padding: 14, alignItems: "center" },
  active: { backgroundColor: "#176b5d", borderColor: "#176b5d" },
  languageText: { fontSize: 16, fontWeight: "600", color: "#24423d" },
  activeText: { color: "#ffffff" },
  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dce7e3", borderRadius: 14, padding: 18, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  disabled: { opacity: 0.48 },
  cardText: { color: "#193c37", fontSize: 16, fontWeight: "600" },
  chevron: { fontSize: 24, color: "#47776d" },
  notice: { backgroundColor: "#fff4df", borderRadius: 12, padding: 14, marginTop: 22 },
  noticeText: { color: "#694b18", lineHeight: 21 },
  footer: { color: "#60736f", lineHeight: 22, marginTop: 16 }
});
