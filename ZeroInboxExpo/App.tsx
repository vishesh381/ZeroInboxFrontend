import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, StatusBar } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import axios from "axios";
import { makeRedirectUri } from "expo-auth-session";

WebBrowser.maybeCompleteAuthSession();

type Extra = {
  API_URL?: string;
  WEB_CLIENT_ID?: string;
};
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const API_URL = extra.API_URL ?? "";
const WEB_CLIENT_ID = extra.WEB_CLIENT_ID ?? "";

// Generate proxy redirect at runtime (works for @username or @anonymous)
const redirectUri = (makeRedirectUri as any)({ useProxy: true });

export default function App() {
  const [status, setStatus] = useState<string>("Idle");
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  // Configure Google request for Expo Go (Android requires androidClientId present)
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: WEB_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    androidClientId: WEB_CLIENT_ID,
    responseType: "code",      // we exchange this on the backend
    usePKCE: false,            // backend uses client_secret
    redirectUri,               // must match Google Console + backend env
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
    extraParams: { prompt: "select_account" },
  });

  useEffect(() => {
    const go = async () => {
      if (!response) return;
      console.log("📡 Auth response:", JSON.stringify(response, null, 2));

      if (response.type !== "success") {
        setStatus("❌ Sign-in cancelled or failed.");
        return;
      }

      const code = (response.params as any).code;
      if (!code) {
        setStatus("❌ No authorization code received.");
        return;
      }

      try {
        setStatus("Exchanging code on backend…");
        const url = `${API_URL}/auth/google/exchange`;
        console.log("🔗 POST", url, { serverAuthCode: code });
        const ex = await axios.post(url, { serverAuthCode: code });
        console.log("🎉 Exchange OK:", ex.data);

        setStatus("Fetching unread…");
        const unread = await axios.get(`${API_URL}/mail/unread?max=5`);
        const count = Array.isArray(unread.data) ? unread.data.length : 0;
        setUnreadCount(count);

        setStatus(`✅ Success! Unread fetched: ${count}`);
      } catch (err: any) {
        const detail = err?.response?.data || err?.message || String(err);
        console.error("❌ Backend error:", detail);
        setStatus(`❌ Backend error: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
      }
    };
    go();
  }, [response]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>ZeroInbox</Text>
      <Text style={styles.subtitle}>Sign in with Google to continue</Text>

      <View style={{ height: 16 }} />
      <Button
        title="Sign in with Google"
        onPress={() => {
          setStatus("Opening Google…");
          // @ts-ignore typings lag; proxy is supported at runtime
          promptAsync({ useProxy: true, showInRecents: true });
        }}
        disabled={!request}
      />

      <View style={{ height: 24 }} />
      <Text style={styles.status}>{status}</Text>
      {unreadCount !== null && (
        <Text style={{ marginTop: 8 }}>Unread (max 5): {unreadCount}</Text>
      )}

      {!API_URL && <Text style={styles.warn}>⚠️ Missing API_URL in app.json → expo.extra</Text>}
      {!WEB_CLIENT_ID && <Text style={styles.warn}>⚠️ Missing WEB_CLIENT_ID in app.json → expo.extra</Text>}
      <Text style={styles.small}>Redirect: {redirectUri}</Text>
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
