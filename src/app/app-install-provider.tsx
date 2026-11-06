"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallOutcome = "instructions" | "accepted" | "dismissed";
const InstallContext = createContext<{
  ready: boolean;
  installed: boolean;
  isIOS: boolean;
  canPrompt: boolean;
  install: () => Promise<InstallOutcome>;
}>({
  ready: false,
  installed: false,
  isIOS: false,
  canPrompt: false,
  install: async () => "instructions",
});
export function useAppInstall() {
  return useContext(InstallContext);
}
export default function AppInstallProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [installed, setInstalled] = useState(false),
    [isIOS, setIOS] = useState(false),
    [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const appleDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const check = () =>
      setInstalled(
        standalone.matches ||
          (!appleDevice &&
            (window.matchMedia("(display-mode: fullscreen)").matches ||
              window.matchMedia("(display-mode: window-controls-overlay)")
                .matches)) ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    setIOS(appleDevice);
    check();
    setReady(true);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallEvent);
    };
    const completed = () => {
      if (appleDevice) check();
      else setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", completed);
    standalone.addEventListener("change", check);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", completed);
      standalone.removeEventListener("change", check);
    };
  }, []);
  async function install(): Promise<"instructions" | "accepted" | "dismissed"> {
    if (!promptEvent) return "instructions";
    try {
      await promptEvent.prompt();
      return (await promptEvent.userChoice).outcome;
    } finally {
      setPromptEvent(null);
    }
  }
  return (
    <InstallContext.Provider
      value={{ ready, installed, isIOS, canPrompt: !!promptEvent, install }}
    >
      {children}
    </InstallContext.Provider>
  );
}
