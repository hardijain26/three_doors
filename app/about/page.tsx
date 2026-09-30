import CareerPath from "@/components/career-path.tsx";
import ProfileSettings from "@/components/profile-settings.tsx";

export default function AboutPage() {
  return (
    <div className="stack-lg">
      <ProfileSettings section="about" />
      <CareerPath />
    </div>
  );
}
