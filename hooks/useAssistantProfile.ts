import { useEffect, useState } from "react";
import { db } from "../services/firebaseInit";
import { isOffline } from "../services/firebaseService";

const FALLBACK_AVATAR = "/skylie-avatar.png";

interface AssistantProfile {
  name: string;
  role: string;
  tone: string;
  avatarUrl: string;
}

export function useAssistantProfile() {
  const [profile, setProfile] = useState<AssistantProfile>({
    name: "Skylie",
    role: "Marknadsassistent",
    tone: "vänlig, coachande, kreativ",
    avatarUrl: FALLBACK_AVATAR,
  });

  useEffect(() => {
    if (isOffline || !db) {
        return;
    }

    (async () => {
      try {
        const ref = db.collection("system").doc("aiAssistant");
        const snap = await ref.get();
        if (snap.exists) {
          const data = snap.data();
          if (data) {
              setProfile(prev => ({
                name: typeof data.name === 'string' ? data.name : prev.name,
                role: typeof data.role === 'string' ? data.role : prev.role,
                tone: typeof data.tone === 'string' ? data.tone : prev.tone,
                avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : prev.avatarUrl,
              }));
          }
        }
      } catch (error) {
        console.warn("Could not fetch AI assistant profile from Firestore, using fallback.", error);
        // Silently fail and use the fallback profile.
      }
    })();
  }, []); // Empty dependency array ensures this runs only once.

  return profile;
}