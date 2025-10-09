import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, StatusBar } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import axios from "axios";
import * as Linking from "expo-linking";
WebBrowser.maybeCompleteAuthSession();

type Extra = {
  API_URL?: string;
  ANDROID_CLIENT_ID?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const API_URL = extra.API_URL ?? "";
const ANDROID_CLIENT_ID = extra.ANDROID_CLIENT_ID ?? "";
const androidClientId = ANDROID_CLIENT_ID;
const googleScheme = `com.googleusercontent.apps.${androidClientId.split('.apps.googleusercontent.com')[0]}`;
const redirectUri = makeRedirectUri({ scheme: googleScheme, path: 'oauthredirect' });
console.log('🔧 Native OAuth config:', { androidClientId, redirectUri });
// ✅ Native redirect URI from your app scheme (no Expo proxy involved)
//const redirectUri = makeRedirectUri({ scheme: "zeroinbox", path: "oauthredirect" });

console.log("🔧 Native OAuth config:", { API_URL, ANDROID_CLIENT_ID, redirectUri });

// Optional: very verbose axios logging
axios.interceptors.request.use(c => { console.log("🛰️ [REQ]", c.method, c.url, c.data); return c; });
axios.interceptors.response.use(
  r => { console.log("✅ [RES]", r.status, r.config.url, r.data); return r; },
  e => { console.log("❌ [ERR]", e?.response?.status, e?.config?.url, e?.response?.data || e?.message); return Promise.reject(e); }
);

export default function App() {
  const [status, setStatus] = useState("Idle");
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  // ✅ Use the ANDROID client ID + PKCE + native redirect
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    responseType: "code",
    usePKCE: true,
    redirectUri,
     scopes: ["openid", "email", "profile"], // <-- test with only these first
  extraParams: { prompt: "select_account" },
  });
useEffect(() => {
  WebBrowser.warmUpAsync();
  const sub = Linking.addEventListener("url", (e) => {
    console.log("🔔 Linking URL event:", e.url);
  });
  return () => {
    sub.remove();
    WebBrowser.coolDownAsync();
  };
}, []);
  useEffect(() => {
    console.log("🧭 useAuthRequest request:", request);
  }, [request]);

  useEffect(() => {
    const run = async () => {
      console.log("📡 Auth response:", JSON.stringify(response, null, 2));
      if (!response) return;

      if (response.type !== "success") {
        setStatus(`❌ Sign-in failed or canceled (${response.type})`);
        return;
      }

      // Get code + PKCE verifier (Expo’s typing doesn’t expose codeVerifier → cast)
      const code = (response as any)?.params?.code as string | undefined;
      const codeVerifier = (request as any)?.codeVerifier as string | undefined;

      console.log("🔐 code:", code);
      console.log("🔑 verifier:", codeVerifier);
      if (!code || !codeVerifier) {
        setStatus("❌ Missing code or codeVerifier.");
        return;
      }

      try {
        setStatus("Exchanging on backend…");
        const payload = { serverAuthCode: code, codeVerifier, clientId: ANDROID_CLIENT_ID, redirectUri };
        console.log("🔗 POST", `${API_URL}/auth/google/exchange`, payload);
        const ex = await axios.post(`${API_URL}/auth/google/exchange`, payload);
        console.log("🎉 Exchange OK:", ex.data);
        setStatus("✅ Linked! Tap 'Fetch Unread'.");

      } catch (err: any) {
        const msg = err?.response?.data || err?.message || String(err);
        console.error("💥 Exchange error:", msg);
        setStatus(`❌ Exchange error: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
      }
    };
    run();
  }, [response]);

  const fetchUnread = async () => {
    try {
      setStatus("Fetching unread…");
      const r = await axios.get(`${API_URL}/mail/unread?max=5`);
      const n = Array.isArray(r.data) ? r.data.length : 0;
      setUnreadCount(n);
      setStatus(`✅ Unread fetched: ${n}`);
      console.log("📥 Unread:", r.data);
    } catch (e: any) {
      const msg = e?.response?.data || e?.message || String(e);
      console.error("💥 Unread error:", msg);
      setStatus(`❌ Unread error: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>ZeroInbox</Text>
      <Text style={styles.subtitle}>Native Google Sign-In (Android, PKCE)</Text>

      <View style={{ height: 16 }} />
      <Button
        title="Sign in with Google"
        onPress={() => { setStatus("Opening Google…"); promptAsync(); }} // no proxy
        disabled={!request}
      />

      <View style={{ height: 12 }} />
      <Button title="Fetch Unread (max 5)" onPress={fetchUnread} />

      <View style={{ height: 24 }} />
      <Text style={styles.status}>{status}</Text>
      {unreadCount !== null && <Text style={{ marginTop: 8 }}>Unread: {unreadCount}</Text>}

      {!API_URL && <Text style={styles.warn}>⚠️ Missing API_URL in app.json → expo.extra</Text>}
      {!ANDROID_CLIENT_ID && <Text style={styles.warn}>⚠️ Missing ANDROID_CLIENT_ID in app.json → expo.extra</Text>}
      <Text style={styles.small}>redirectUri: {redirectUri}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#555" },
  status: { fontSize: 16, marginTop: 10, textAlign: "center" },
  warn: { marginTop: 8, fontSize: 12, color: "#a00", textAlign: "center" },
  small: { marginTop: 8, fontSize: 12, color: "#666", textAlign: "center" },
});
