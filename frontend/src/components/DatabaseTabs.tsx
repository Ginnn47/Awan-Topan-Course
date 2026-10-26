import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "./ui";

const tabs = [
  {
    path: "/database/students",
    label: "Student & Rombel",
    icon: "groups",
  },
  { path: "/database/teachers", label: "Teacher", icon: "person" },
];

export default function DatabaseTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="grid grid-cols-2 rounded-[8px] border border-stone-200 bg-white p-1 shadow-sm sm:flex sm:w-fit">
      {tabs.map((tab) => {
        const active = location.pathname.startsWith(tab.path);
        return (
          <button
            key={tab.path}
            className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[7px] px-3 text-xs font-bold transition sm:px-5 ${active ? "bg-[#18191B] text-amber-400 font-bold shadow-xs" : "text-stone-600 hover:bg-stone-100 hover:text-neutral-900 font-medium"}`}
            style={active ? { backgroundColor: "#18191B", color: "#F59E0B" } : undefined}
            onClick={() => navigate(tab.path)}
          >
            <Icon name={tab.icon} className="text-base" />
            <span className="break-words text-center">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
