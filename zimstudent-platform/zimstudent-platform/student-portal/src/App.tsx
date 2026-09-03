import { useState } from "react";
import { getToken } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getToken()));

  if (!loggedIn) {
    return <LoginPage onLoggedIn={() => setLoggedIn(true)} />;
  }
  return <HomePage onLoggedOut={() => setLoggedIn(false)} />;
}
