import { ShowroomScreen } from '@/features/showroom/showroom-screen';
import { NotFoundScreen } from '@/features/shell/not-found-screen';
import { authConfig } from '@/lib/auth-config';

export default function ShowroomRoute() {
  // Only development builds have the showroom (spec 0005, AC-059).
  return authConfig.devLogin ? <ShowroomScreen /> : <NotFoundScreen />;
}
