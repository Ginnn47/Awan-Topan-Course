import { useEffect, useState } from "react";
import {
  getOperationalDate,
  getPhysicalToday,
  isOperationalDateOverridden,
  resetOperationalDate,
  setOperationalDate,
} from "../services/operationalDateService.js";
import { subscribeDataChanges } from "../services/dataStore.js";

export default function useOperationalDate() {
  const [date, setDate] = useState(() => getOperationalDate());

  useEffect(() => {
    const refresh = () => setDate(getOperationalDate());
    const unsubscribe = subscribeDataChanges(refresh, ["settings"]);
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return {
    date,
    physicalToday: getPhysicalToday(),
    isOverridden: isOperationalDateOverridden(),
    setDate: setOperationalDate,
    resetDate: resetOperationalDate,
  };
}
