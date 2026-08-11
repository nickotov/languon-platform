import { StatusBar } from "expo-status-bar";

import { HomeScreen } from "./src/screens/home-screen";

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <HomeScreen />
    </>
  );
}
