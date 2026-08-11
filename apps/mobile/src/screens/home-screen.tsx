import { SafeAreaView, StyleSheet, Text, View } from "react-native";

export function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>AI-FIRST LANGUAGE LEARNING</Text>
        <Text style={styles.title}>Languon</Text>
        <Text style={styles.body}>
          Personalized courses and an adaptive tutor, wherever you practice.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#607069",
    fontSize: 18,
    lineHeight: 28,
  },
  content: {
    maxWidth: 520,
    padding: 28,
  },
  eyebrow: {
    color: "#176b52",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  screen: {
    alignItems: "center",
    backgroundColor: "#f4f1e8",
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "#19231f",
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: -3,
    marginBottom: 18,
    marginTop: 10,
  },
});
