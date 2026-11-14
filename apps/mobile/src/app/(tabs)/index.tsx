import { HomeScreen } from '@/features/home';
import { VoiceSection } from '@/features/voice';

export default function HomeRoute() {
  return (
    <HomeScreen showReports>
      <VoiceSection />
    </HomeScreen>
  );
}
