import { appIcon } from "@/components/brand/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon for the back office: see @/components/brand/app-icon for the colour pairing.
export default function AppleIcon() {
  return appIcon("office", 180, 0.17);
}
