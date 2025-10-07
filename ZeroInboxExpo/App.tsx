import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, StatusBar } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import axios from "axios";

WebBrowser.maybeCompleteAuthSession();

type Extra = {
  API_URL?: string;
  WEB_CLIENT_ID?: string;
  ANDROID_CLIENT_ID?: string;
  IOS_CLIENT_ID?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
const API_URL = extra.API_URL ?? "";
const WEB_CLIENT_ID = extra.WEB_CLIENT_ID ?? "";

export default function App() {
  const [status, setStatus] = useState<string>("Idle");

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    androidClientId: extra.ANDROID_CLIENT_ID, // optional; add later for native client
    responseType: "code",                     // we’ll exchange this on the backend
    usePKCE: false,                           // backend uses client_secret to exchange
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"],
  });

  useEffect(() => {
    const handleAuth = async () => {
      if (!response) return;

      if (response.type === "success") {
        try {
          setStatus("Exchanging token...");
          const code = (response.params as any).code;
          await axios.post(`${API_URL}/auth/google/exchange`, { serverAuthCode: code });
          setStatus("✅ Success! Tokens saved on backend.");
        } catch (err: any) {
          console.error(err);
          setStatus("❌ Failure during token exchange.");
        }
      } else if (response.type === "dismiss" || response.type === "error") {
        setStatus("❌ Sign-in cancelled or failed.");
      }
    };
    handleAuth();
  }, [response]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>ZeroInbox</Text>
      <Text style={styles.subtitle}>Sign in with Google to continue</Text>

      <View style={{ height: 20 }} />
      <Button
        title="Sign in with Google"
        onPress={() => {
          setStatus("Opening Google...");
          promptAsync();
        }}
        disabled={!request}
      />

      <View style={{ height: 30 }} />
      <Text style={styles.status}>{status}</Text>

      {/* Helpful for debugging config */}
      {!API_URL && <Text style={styles.warn}>⚠️ Missing API_URL in app.json → expo.extra</Text>}
      {!WEB_CLIENT_ID && <Text style={styles.warn}>⚠️ Missing WEB_CLIENT_ID in app.json → expo.extra</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#555", marginTop: 6, textAlign: "center" },
  status: { fontSize: 16, marginTop: 10, textAlign: "center" },
  warn: { marginTop: 8, fontSize: 12, color: "#a00", textAlign: "center" },
});
